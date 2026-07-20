"""
Point every design-system page at the current hashed asset URLs.

Run after scripts/build_ds_assets.py whenever a shared file changes. Without it a
page keeps referencing the previous hash and silently runs stale CSS/JS — the
exact failure the hashing was introduced to prevent.

Run:  python scripts/build_ds_assets.py && python scripts/repoint_ds_assets.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / "static" / "ds-assets.json").read_text(encoding="utf-8"))

# hashed-URL pattern -> current URL, keyed by asset stem
CURRENT = {}
for src, url in MANIFEST.items():
    stem = pathlib.Path(src).stem          # e.g. tmr-ds-leaderboards
    ext = pathlib.Path(src).suffix         # .css / .js
    sub = "css" if ext == ".css" else "js"
    CURRENT[stem] = (re.compile(rf"/static/{sub}/{re.escape(stem)}\.[0-9a-f]{{12}}{re.escape(ext)}"), url)


def main():
    changed = []
    for page in ROOT.rglob("*.html"):
        if ".git" in page.parts or "_qa_baseline" in page.parts:
            continue
        text = page.read_text(encoding="utf-8")
        if "tmr-ds" not in text:
            continue
        new = text
        for pat, url in CURRENT.values():
            new = pat.sub(url, new)
        if new != text:
            page.write_text(new, encoding="utf-8")
            changed.append(str(page.relative_to(ROOT)).replace("\\", "/"))

    for c in changed:
        print("repointed " + c)
    print(f"{len(changed)} page(s) updated")


if __name__ == "__main__":
    main()
