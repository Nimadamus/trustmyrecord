"""
Undo the light-to-dark SURFACE conversion the theme rollout made inside a page's
own <style> block, while keeping the teal-to-electric-blue ACCENT recolour that
was made in the same pass.

HOW IT DECIDES. It diffs the page against the pre-theme commit line by line. A
changed line is reverted only when the PRE-THEME line carried one of the known
light-theme surface or ink values (white/near-white grounds, navy-on-white ink).
Every other changed line is left exactly as it is, so:

    --bg: #FFFFFF        ->  #0E1620      REVERTED   (surface)
    --ink-2: #2E4459     ->  #B7CBE1      REVERTED   (ink)
    --cyan: #0C948C      ->  #0B4FA8      KEPT       (accent recolour)
    .dot{background:#12A594} -> #1D7FE8   KEPT       (accent recolour)

Only lines inside a <style> block are considered, so markup and copy are never
touched.

Byte-safe: binary I/O, line endings preserved.

Run:  python scripts/restore_page_surfaces.py <page> [<page> ...]
      python scripts/restore_page_surfaces.py --apply <page> [...]
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRE_THEME = "5511b80ec"

# The light ramp the site used before the rollout: grounds, panels, hairlines,
# and the navy inks that sat on them.
LIGHT_VALUES = [
    "#FFFFFF", "#FFF", "#F4F7FA", "#F6F9FC", "#F8FAFC", "#EDF3F9", "#E6EDF5",
    "#EEF2F7", "#E2E8F0", "#D2DEEA", "#DCE4EE", "#B7C8DA", "#CBD5E1",
    "#07182A", "#0A1B2E", "#0F172A", "#1D2430", "#2E4459", "#3C5468",
    "#5A7085", "#5E7590", "#64748B", "#475569", "#334155",
]
LIGHT_RE = re.compile("|".join(re.escape(v) for v in LIGHT_VALUES), re.I)
# rgba() forms of the same two families: near-white fills and navy ink.
LIGHT_RGBA = re.compile(r"rgba\(\s*(?:255,\s*255,\s*255|248,\s*250,\s*252|244,\s*247,\s*250|7,\s*24,\s*42|15,\s*23,\s*42|31,\s*45,\s*66)\s*,", re.I)


def is_surface_line(line):
    return bool(LIGHT_RE.search(line) or LIGHT_RGBA.search(line))


def style_ranges(text):
    """byte ranges covered by <style> ... </style>"""
    out = []
    for m in re.finditer(rb"<style[^>]*>(.*?)</style>", text, re.S | re.I):
        out.append((m.start(1), m.end(1)))
    return out


def in_style(pos, ranges):
    return any(a <= pos < b for a, b in ranges)


def restore(rel, apply_):
    cur_path = ROOT / rel
    cur = cur_path.read_bytes()
    old = subprocess.run(["git", "show", PRE_THEME + ":" + rel], capture_output=True, cwd=str(ROOT)).stdout
    if not old:
        print(rel + ": not in pre-theme tree, skipped")
        return 0

    nl = b"\r\n" if cur.count(b"\r\n") > cur.count(b"\n") // 2 else b"\n"
    ranges = style_ranges(cur)
    if not ranges:
        print(rel + ": no <style> block, skipped")
        return 0

    import difflib
    a = old.decode("utf-8", "replace").replace("\r\n", "\n").split("\n")
    b = cur.decode("utf-8", "replace").replace("\r\n", "\n").split("\n")
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)

    # rebuild the current file, swapping back only the qualifying lines
    out = []
    reverted = 0
    # byte offset of each current line, to test the <style> membership
    offsets, pos = [], 0
    for line in b:
        offsets.append(pos)
        pos += len(line.encode("utf-8", "replace")) + len(nl)

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag in ("equal", "insert"):
            out.extend(b[j1:j2])
            continue
        if tag == "delete":
            continue
        # replace: pair them up positionally
        for k in range(j1, j2):
            oi = i1 + (k - j1)
            oldline = a[oi] if oi < i2 else None
            if oldline is not None and is_surface_line(oldline) and in_style(offsets[k], ranges):
                out.append(oldline)
                reverted += 1
            else:
                out.append(b[k])

    if not reverted:
        print(rel + ": nothing to revert")
        return 0
    new = nl.join(s.encode("utf-8", "replace") for s in out)
    if cur.endswith(nl) and not new.endswith(nl):
        new += nl
    if apply_:
        cur_path.write_bytes(new)
    print(rel + ": " + ("reverted " if apply_ else "would revert ") + str(reverted) + " surface/ink line(s)")
    return reverted


def main():
    apply_ = "--apply" in sys.argv
    pages = [a for a in sys.argv[1:] if not a.startswith("--")]
    total = 0
    for p in pages:
        rel = p if p.endswith(".html") else p.strip("/") + "/index.html"
        total += restore(rel, apply_)
    print("total: " + str(total))


if __name__ == "__main__":
    main()
