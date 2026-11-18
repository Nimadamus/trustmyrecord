#!/usr/bin/env python3
"""
ACCOUNT_SETTINGS_20261115 -- puts the appearance boot snippet at the top of
<head> on every page that carries the shared header (tmr-ds-nav), so a member
who chose Light (or System Default on a light device) never sees a dark flash.

Dark members are unaffected: the snippet reads one localStorage key and returns.
Light members get html[data-tmr-theme="light"] plus the light sheets written
with document.write while the parser is still in <head> (render blocking on
purpose: that is what prevents the flash).

Idempotent: the snippet sits between TMR_THEME_BOOT markers and is replaced in
place on every run. Run after scripts/build_theme_light.py; the ?v= tags are
re-pinned by scripts/version_static_refs.py like every other reference.

  python scripts/inject_theme_boot.py            # write
  python scripts/inject_theme_boot.py --check    # exit 1 if any page is missing or stale
"""
from __future__ import annotations

import hashlib
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "node_modules", "workers", "artifacts", ".github"}
START, END = "<!-- TMR_THEME_BOOT -->", "<!-- /TMR_THEME_BOOT -->"
BLOCK = re.compile(re.escape(START) + r".*?" + re.escape(END) + r"\r?\n?", re.S)
HEAD = re.compile(r"<head\b[^>]*>", re.I)
CHARSET = re.compile(r"<meta\s+charset=[^>]*>", re.I)

# page file (relative, forward slashes) -> its page sheet slug; u/<name>/ is the profile document.
PAGE_SHEETS = {
    "index.html": "home", "feed/index.html": "feed", "profile/index.html": "profile",
    "leaderboards/index.html": "leaderboards", "forum/index.html": "forum",
    "handicappers/index.html": "handicappers", "contests/index.html": "contests",

}


def vtag(rel: str) -> str:
    with open(os.path.join(ROOT, rel), "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:12]


def sheet_for(rel: str):
    if rel in PAGE_SHEETS:
        return PAGE_SHEETS[rel]
    if re.fullmatch(r"u/[^/]+/index\.html", rel):
        return "profile"
    return None


# Pages that stay dark whatever the member chose: the sportsbook board is a
# dark product surface (its own rule since 2026-08-31), and a half light board
# reads worse than a consistent dark one.
# 2026-11-18: pages whose own inline styles were never run through the light
# build. In light mode their dark panels got dark ink and their light ink landed
# on light surfaces (measured: Pending Picks explainer, Trend Spotter hero and
# compare table, Premium plans, TMR Coin tags, Wallet filter chips, Trivia
# lead, Polls leaderboard). Dark until each gets its own light sheet.
DARK_ONLY = re.compile(r"^(sportsbook|pending-picks|trendspotter|premium|tmr-coin|wallet|trivia|polls)/")


def snippet(rel: str) -> str:
    sheets = ["/static/css/tmr-theme-light.css?v=" + vtag("static/css/tmr-theme-light.css")]
    slug = sheet_for(rel)
    if slug:
        p = f"static/css/tmr-theme-light-{slug}.css"
        sheets.append("/" + p + "?v=" + vtag(p))
    arr = ",".join("'" + s + "'" for s in sheets)
    js = (
        "(function(w,d){var K='tmr_theme',S=[" + arr + "],e=d.documentElement,Q='(prefers-color-scheme: light)';"
        "function g(){try{return localStorage.getItem(K)||'dark'}catch(_){return 'dark'}}"
        "function f(t){return " + ("false&&" if DARK_ONLY.match(rel) else "") + "(t==='light'||(t==='system'&&w.matchMedia&&w.matchMedia(Q).matches))?'light':'dark'}"
        "function L(on){for(var i=0;i<S.length;i++){var l=d.getElementById('tmrThemeLight'+i);"
        "if(on&&!l){l=d.createElement('link');l.rel='stylesheet';l.id='tmrThemeLight'+i;l.href=S[i];(d.head||e).appendChild(l)}"
        "if(l)l.disabled=!on}}"
        "function a(t){if(f(t)==='light'){e.setAttribute('data-tmr-theme','light');L(1)}else{e.removeAttribute('data-tmr-theme');L(0)}}"
        "w.TMRTheme={get:g,effective:function(){return f(g())},apply:a,set:function(v){try{localStorage.setItem(K,v)}catch(_){}a(v)}};"
        "if(f(g())==='light'){e.setAttribute('data-tmr-theme','light');"
        "for(var i=0;i<S.length;i++)d.write('<link rel=\"stylesheet\" id=\"tmrThemeLight'+i+'\" href=\"'+S[i]+'\">')}"
        "try{w.matchMedia(Q).addEventListener('change',function(){if(g()==='system')a('system')})}catch(_){}"
        "})(window,document);"
    )
    return START + "<script>" + js + "</script>" + END + "\n"


def pages():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn.endswith(".html"):
                full = os.path.join(dirpath, fn)
                yield full, os.path.relpath(full, ROOT).replace("\\", "/")


def main():
    check = "--check" in sys.argv
    changed = missing = 0
    for full, rel in pages():
        with io.open(full, "r", encoding="utf-8", errors="surrogateescape", newline="") as fh:
            html = fh.read()
        if "tmr-ds-nav" not in html:
            continue
        snip = snippet(rel)
        if START in html:
            new = BLOCK.sub(lambda m: snip, html, count=1)
        else:
            m = CHARSET.search(html[:4000]) or HEAD.search(html[:4000])
            if not m:
                missing += 1
                continue
            new = html[:m.end()] + snip + html[m.end():]
        if new != html:
            changed += 1
            if not check:
                with io.open(full, "w", encoding="utf-8", errors="surrogateescape", newline="") as fh:
                    fh.write(new)
    sys.stderr.write(f"{'stale' if check else 'updated'}: {changed}, no <head>: {missing}\n")
    if check and changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
