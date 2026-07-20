"""
Neutralise the profile page's hardcoded dark SHELL paint in a design-system copy.

Context: /profile/ carries a block commented "May 1 2026: direct profile redesign
layer. This lives in the profile HTML itself so /profile/ updates even if an
external CSS/JS asset is stale in the browser or CDN cache." It paints the page
shell with stacked radial-gradients over #050a14.

That block is doing its job — it is deliberately authoritative. Escalating
specificity against it from a stylesheet is the wrong move: it would be a
specificity war of exactly the kind this project exists to end, and the page
would keep fighting back on every future edit. For a rebuild the correct fix is
to delete the obsolete declaration.

ONLY the body shell paint is removed. Every component rule inside that block is
left untouched — the design-system layer restyles those by matching their
selector weight, which works.

Run against a staged copy, never against production directly:
    python scripts/ds_profile_shell_fix.py preview/profile/index.html
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# the shell paint: a body rule whose only job is the dark background stack
SHELL_RE = re.compile(
    r'body\.profile-page\.tmr-social-profile\s*\{\s*background:\s*'
    r'(?:radial-gradient|linear-gradient)[^}]*?\}',
    re.S)


def main(rel):
    p = ROOT / rel
    s = p.read_text(encoding="utf-8")
    matches = SHELL_RE.findall(s)
    if not matches:
        print("no shell paint rule found - nothing to do")
        return
    for m in matches:
        print("removing:", re.sub(r"\s+", " ", m)[:110])
    s = SHELL_RE.sub(
        "/* shell paint removed for the design system: the light page background "
        "is set by tmr-ds-profile.css */", s)
    p.write_text(s, encoding="utf-8")
    print(f"removed {len(matches)} shell paint rule(s) from {rel}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "preview/profile/index.html")
