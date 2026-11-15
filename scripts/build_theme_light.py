#!/usr/bin/env python3
"""
ACCOUNT_SETTINGS_20261115 -- builds the member-selectable LIGHT appearance.

Dark stays the site default and is byte for byte untouched: everything here
only applies under  html[data-tmr-theme="light"],  which the head boot snippet
(scripts/inject_theme_boot.py) sets before first paint for members who chose
Light, or System Default on a light device.

How: the shared sheets and the inline <style> of the main pages hard-code a
dark palette. This lifts only the colour-bearing declarations, remaps them
through the role-aware transform the site already uses for its light pages
(scripts/light_theme_transform.py: background -> surface ramp, color -> ink
ramp, borders -> line ramp, accents keep their hue) and re-scopes them under
the light attribute with !important, so source order and the original
selector's specificity never matter. Geometry is never copied, so this cannot
re-lay-out a page. The navy header and footer stay navy on purpose (same rule
as build_light_overrides.py KEEP_DARK).

Outputs
  static/css/tmr-theme-light.css             shared sheets + hand-written base
  static/css/tmr-theme-light-<page>.css      one per page listed in PAGES

Hand-written decisions live in static/css/tmr-theme-light-base.css and are
appended LAST so they win.

  python scripts/build_theme_light.py
"""
from __future__ import annotations

import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from light_theme_transform import CLIP_TEXT, rewrite_declarations, HEX_RE, FUNC_RE, parse_hex, parse_func, lum, chroma  # noqa: E402
from build_light_overrides import split_rules, HAS_COLOR_VALUE, COLOR_DECL  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCOPE = 'html[data-tmr-theme="light"]'

# Every sheet that more than ~100 pages load, plus the feed/member sheets.
SHARED = [
    "tmr-ds.css", "tmr-ds-header.css", "tmr-navbar.css", "tmr-linkhub.css", "tmr-share.css",
    "tmr-theme-a.css", "tmr-hc-hero.css", "tmr-hc-electric.css", "tmr-ds-handicappers.css",
    "tmr-mlb-matchup.css", "tmr-handicap.css", "tmr-ds-user.css", "tmr-sitewide.css",
    "tmr-article.css", "tmr-sim-ux.css", "tmr-aplus.css", "tmr-sim-arena.css", "tmr-dark-finish.css",
    "tmr-notif-v2.css", "member-home.css",
    "tmr-ds-profile.css", "tmr-ds-leaderboards.css", "tmr-ds-community.css", "tmr-ds-contests.css",
    "tmr-redesign-overrides.css", "tmr-flair.css", "tmr-pick-visibility.css", "tmr-lb-arena.css", "tmr-tools-aplus.css",
]

# Scripts that inject their own <style> on many pages (bell dropdown, profile
# fan identity, badges). Their CSS is read out of the source, never executed.
SHARED_JS = ["tmr-fan-identity.js", "notifications.js", "nav-badges.js", "official-badge.js", "first-pick-onboarding.js"]
TEXTCONTENT = re.compile(r"\.textContent\s*=\s*(\[.*?\]\s*\.join\([^)]*\)|`[^`]*`|(?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)", re.S)
STR_LIT = re.compile(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"|`([^`]*)`", re.S)


def js_css(src: str) -> str:
    out = []
    for m in TEXTCONTENT.finditer(src):
        text = "".join(a or b or c for a, b, c in STR_LIT.findall(m.group(1)))
        if "{" in text and ":" in text:
            out.append(text.replace("\\'", "'"))
    for m in re.finditer(r"var css\s*=\s*\[(.*?)\]\s*\.join", src, re.S):
        out.append("".join(a or b or c for a, b, c in STR_LIT.findall(m.group(1))))
    return "\n".join(out)


# Page-only sheets ride with their page instead of every light page.
PAGE_EXTRA = {
    "home": ["tmr-concept-a.css", "home-holo.css"],
    "feed": ["social-home.css", "feed-v2.css", "feed-social.css", "feed-open-picks.css", "feed-comments.css"],
    "forum": ["tmr-forum-app.css", "tmr-forum-arena.css"],
}

# Pages whose own <style> blocks carry most of what you see. slug -> html file.
PAGES = {
    "home": "index.html",
    "feed": "feed/index.html",
    "profile": "profile/index.html",
    "leaderboards": "leaderboards/index.html",
    "forum": "forum/index.html",
    "handicappers": "handicappers/index.html",
    "contests": "contests/index.html",
}

# Chrome that keeps its navy look in light mode (and its menus, which render on it).
KEEP_DARK = re.compile(
    r"ds-nav|v2nav|ds-footer|tmrlh-footer|tmr-global-nav|tmr-global-footer|tmr-account-menu|"
    r"tmr-user-menu|tmr-nav\b|tmr-ticker|scrollbar|::selection|"
    # photo heroes: white type sits on a photograph, not on a surface
    r"hero-stadium|stadium|hc-hero|tmr-hc-hero|blp-hero|mb-hero|(^|[\s.>,])(hero|hx|hh)|\.hero-",
    re.I,
)

STYLE_BLOCK = re.compile(r"(?is)<style[^>]*>(.*?)</style>")
AT_RULE = re.compile(r"^\s*@(media|supports)([^{]*)\{(.*)\}\s*$", re.S)
IMPORTANT = re.compile(r"\s*!\s*important\s*$", re.I)


NOT_CHROME = ":not(.ds-nav *,.ds-footer *,.tmrlh-footer *,.hero *)"
PSEUDO_EL = re.compile(r"(::?(?:before|after|placeholder|marker|selection|first-line|first-letter|-webkit-[a-z-]+))+$", re.I)


def off_chrome(sel: str) -> str:
    """Never repaint inside the navy header/footer: the subject must not be in them."""
    if re.search(r"(^|\s|>)(html|body|:root)([.#\[:][^\s>]*)?$", sel):
        return sel
    m = PSEUDO_EL.search(sel)
    if m:
        return sel[:m.start()] + NOT_CHROME + sel[m.start():]
    return sel + NOT_CHROME


def scope_one(sel: str) -> str:
    return off_chrome(_scope_one(sel))


def _scope_one(sel: str) -> str:
    s = sel.strip()
    if s in (":root", "html", ":root,html"):
        return SCOPE
    if s.startswith(":root"):
        return SCOPE + s[len(":root"):]
    if s.startswith("html"):
        rest = s[4:]
        if rest[:1] in ("", " ", ".", "[", ":", ">"):
            return SCOPE + rest
    return SCOPE + " " + s


def important(body: str) -> str:
    out = []
    for d in body.split(";"):
        if not d.strip():
            continue
        out.append(IMPORTANT.sub("", d.strip()) + " !important")
    return ";".join(out)


def first_color(value: str):
    m = HEX_RE.search(value)
    f = FUNC_RE.search(value)
    if f and (not m or f.start() < m.start()):
        return parse_func(f.group(1), f.group(2))
    return parse_hex(m.group(0)) if m else None


def decl_value(body: str, names) -> str | None:
    for d in body.split(";"):
        if ":" in d and d.split(":", 1)[0].strip().lower() in names:
            return d.split(":", 1)[1]
    return None


def keep_white_on_accent(orig: str, new: str) -> bool:
    """A button or chip with light type on a coloured fill keeps white type:
    the fill keeps its hue in light mode, so dark type would vanish into it."""
    c = decl_value(orig, ("color",))
    bg = decl_value(new, ("background", "background-color", "background-image"))
    if not c or not bg:
        return False
    tc, bc = first_color(c), first_color(bg)
    if not tc or not bc or bc[3] < 0.6:
        return False
    return lum(*tc[:3]) > 200 and chroma(*bc[:3]) >= 0.25 and lum(*bc[:3]) < 170


def process(chunk: str, out: list[str]):
    m = AT_RULE.match(chunk)
    if m:
        if m.group(1).lower() == "media" and re.search(r"prefers-color-scheme\s*:\s*light|print", m.group(2), re.I):
            return
        inner: list[str] = []
        for sub in split_rules(m.group(3)):
            process(sub, inner)
        if inner:
            out.append(f"@{m.group(1)}{m.group(2)}{{\n" + "\n".join(inner) + "\n}")
        return
    if "{" not in chunk:
        return
    sel, _, body = chunk.partition("{")
    body = body.rstrip().rstrip("}")
    sel = " ".join(sel.split())
    if not sel or sel.startswith("@") or KEEP_DARK.search(sel):
        return
    if re.search(r"@keyframes|from|to|\d+%", sel) and re.fullmatch(r"(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*", sel):
        return
    decls = []
    for d in body.split(";"):
        if not d.strip() or not HAS_COLOR_VALUE.search(d):
            continue
        prop = d.split(":", 1)[0].strip().lower()
        if prop.startswith("--") or COLOR_DECL.search(";" + d + ":"):
            decls.append(d.strip())
    if not decls:
        return
    new_body, changed = rewrite_declarations(";".join(decls) + ";", clip_text=bool(CLIP_TEXT.search(body)))
    if not changed:
        return
    parts = [scope_one(p) for p in sel.split(",") if p.strip()]
    if keep_white_on_accent(body, new_body):
        new_body = re.sub(r"(^|;)\s*color\s*:[^;]*", r"color:#FFFFFF", new_body)
    new_body = important(new_body)
    if CLIP_TEXT.search(body) and re.search(r"(^|;)\s*background\s*:", new_body):
        # the background shorthand resets background-clip: put the text clip back
        new_body += ";-webkit-background-clip:text !important;background-clip:text !important"
    out.append(",".join(parts) + "{" + new_body + "}")


def strip_keyframes(css: str) -> str:
    # keyframe blocks hold animation colours; a light page does not need them remapped
    out, i = [], 0
    for m in re.finditer(r"@(-webkit-)?keyframes[^{]*\{", css):
        if m.start() < i:
            continue
        out.append(css[i:m.start()])
        depth, j = 1, m.end()
        while j < len(css) and depth:
            depth += {"{": 1, "}": -1}.get(css[j], 0)
            j += 1
        i = j
    out.append(css[i:])
    return "".join(out)


def derive(css: str) -> str:
    out: list[str] = []
    for chunk in split_rules(strip_keyframes(css)):
        process(chunk, out)
    return "\n".join(out)


def read(rel: str) -> str:
    with io.open(os.path.join(ROOT, rel.replace("/", os.sep)), "r", encoding="utf-8", errors="replace", newline="") as fh:
        return fh.read()


def write(rel: str, text: str):
    path = os.path.join(ROOT, rel.replace("/", os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    sys.stderr.write(f"wrote {rel} ({len(text)} bytes)\n")


CHROME = ':is(.ds-nav,.ds-footer,.tmrlh-footer,.ds-menu-panel)'


def chrome_tokens() -> str:
    """The header and footer keep the dark palette: re-declare the dark custom
    properties on them (theme-a token block + the design system dark block), so
    everything inside that reads a token stays navy."""
    decls = {}
    for rel, pat in (("static/css/tmr-ds.css", r"body\.tmr-ds\.tmr-ds--dark[^{]*\{([^}]*)\}"),
                     ("static/css/tmr-theme-a.css", r"body\.tmr-ds,\s*body\.tmr-ds-shell,\s*body\.tmr-theme-a\s*\{([^}]*)\}")):
        m = re.search(pat, re.sub(r"/\*.*?\*/", "", read(rel), flags=re.S))
        if not m:
            continue
        for d in m.group(1).split(";"):
            if d.strip().startswith("--") and ":" in d:
                k, v = d.split(":", 1)
                decls[k.strip()] = v.strip()
    body = ";".join(f"{k}:{v} !important" for k, v in decls.items())
    return "/* ---- header/footer keep the dark tokens ---- */" + chr(10) + f"{SCOPE} {CHROME}{{{body};color-scheme:dark}}" + chr(10)


BANNER = """/* GENERATED by scripts/build_theme_light.py -- do not edit.
   Light appearance, only under html[data-tmr-theme="light"]. Hand-written
   rules: static/css/tmr-theme-light-base.css (appended last). */
"""


def main():
    chunks = []
    for name in SHARED:
        rel = "static/css/" + name
        if not os.path.exists(os.path.join(ROOT, rel)):
            continue
        chunks.append(f"/* ---- {rel} ---- */\n" + derive(read(rel)))
    for name in SHARED_JS:
        rel = "static/js/" + name
        if os.path.exists(os.path.join(ROOT, rel)):
            chunks.append(f"/* ---- styles injected by {rel} ---- */\n" + derive(js_css(read(rel))))
    base = chrome_tokens() + chr(10) + read("static/css/tmr-theme-light-base.css")
    write("static/css/tmr-theme-light.css", BANNER + "\n".join(chunks) + "\n\n/* ---- base ---- */\n" + base + "\n")
    for slug, rel in PAGES.items():
        html = read(rel)
        css = "\n".join([read("static/css/" + x) for x in PAGE_EXTRA.get(slug, [])] + STYLE_BLOCK.findall(html))
        write(f"static/css/tmr-theme-light-{slug}.css", BANNER + f"/* ---- inline styles of /{rel} ---- */\n" + derive(css) + "\n")


if __name__ == "__main__":
    main()
