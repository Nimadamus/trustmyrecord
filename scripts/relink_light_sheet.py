"""
Put static/css/tmr-light.css back on the pages that linked it before the theme
rollout.

WHY: tmr-light.css is what made the internal pages light. tmr-sitewide.css is a
DARK sheet (--tmr-bg:#080d12) and always has been; the light sheet loaded after
it and overrode the ramp. The rollout retired the light sheet and put
tmr-theme-a.css in its place, which is why removing theme-a alone left those
pages on tmr-sitewide's dark ground.

The link goes back in its pre-theme position: after tmr-linkhub.css and BEFORE
the shared navbar sheet, so the navbar keeps its approved dark treatment while
the page body goes light.

Never touched: index.html, handicappers/index.html, today/index.html.

Byte-safe binary I/O. Run:
    python scripts/relink_light_sheet.py            # list
    python scripts/relink_light_sheet.py --apply
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRE_THEME = "5511b80ec"
LOCKED = {"index.html", "handicappers/index.html", "today/index.html"}
LINK = b'<link rel="stylesheet" href="/static/css/tmr-light.css?v=8e042cdd8bd6">'
ANCHOR = b'<!-- The one approved navbar'


def wanted():
    out = subprocess.run(["git", "grep", "-l", "tmr-light.css", PRE_THEME, "--", "*.html"],
                         capture_output=True, cwd=str(ROOT)).stdout.decode()
    return sorted({ln.split(":", 1)[1] for ln in out.splitlines() if ":" in ln})


def main():
    apply_ = "--apply" in sys.argv
    n = 0
    for rel in wanted():
        if rel in LOCKED:
            continue
        p = ROOT / rel
        if not p.exists():
            continue
        data = p.read_bytes()
        if b"tmr-light.css" in data:
            continue
        nl = b"\r\n" if data.count(b"\r\n") > data.count(b"\n") // 2 else b"\n"
        i = data.find(ANCHOR)
        if i == -1:
            i = data.lower().rfind(b"</head>")
            if i == -1:
                continue
        data = data[:i] + LINK + nl + data[i:]
        n += 1
        if apply_:
            p.write_bytes(data)
        else:
            print(rel)
    print(("relinked " if apply_ else "would relink ") + str(n) + " page(s)")


if __name__ == "__main__":
    main()
