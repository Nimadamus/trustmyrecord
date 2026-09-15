#!/usr/bin/env python3
"""
prerender_run.py - the Prerender Directory Refresh job, with failures isolated.

PRERENDER_ISOLATION_20260915. The workflow used to run each generator and gate as
a plain step, so the first non-zero exit killed the job before the commit step.
On 2026-09-14/15 a logo check on one soccer Game File (a page this job does not
even build) failed the SEO gate every 30 minutes from at least 23:37 PDT, and the
leaderboard and directory bakes, which were fine, never shipped: the crawler copy
of /leaderboards/ kept printing "#1" on makaveli66 after the canonical ranking
had gone live.

How a run works now:

  1. Each STAGE (one generator) runs on its own. Before it starts, everything the
     previous stages produced is staged in the git index, so the index is always
     the last good state. A stage that exits non-zero has its own files restored
     from the index (tracked files checked out, new untracked files removed) and
     the run moves on.
  2. Page-level results come from the generators themselves (prerender_report.py),
     so a single bad profile, thread or homepage region is logged while the rest of
     that stage still writes.
  3. VALIDATORS re-read what a stage baked. A page whose ranks do not equal the live
     canonical ranking API (scripts/verify_cached_ranks.py) is restored to its last
     good version on its own.
  4. GATES (SEO indexability, the /u/ edge fallback, the Game File logo guard) run
     over the result. When one fails, the run finds out whether THIS run caused it:
     each stage's changes are reversed one at a time and the gate re-run. The stage
     whose reversal makes the gate pass is marked failed and stays reversed. If the
     gate fails even with every generated change reversed, the problem was already
     in the repository; it is reported as a pre-existing warning and does not
     block the pages this run rebuilt correctly.
  5. A report of pages attempted, succeeded, kept and failed, with reasons and
     durations, is printed, written to the GitHub step summary, and exported as
     step outputs. The workflow commits whatever is good, then fails the run when
     any page or stage failed, so a failure is obvious without stopping the rest.

Never replaces a good page with a broken or empty one: every restore goes back to
the last good bytes, and the generators refuse to write empty output.

  python scripts/prerender_run.py [--only directory,home_snapshot] [--skip-gates]
"""
import json
import os
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

PY = sys.executable
NODE = "node"
STAGE_TIMEOUT_S = int(os.environ.get("PRERENDER_STAGE_TIMEOUT", "420"))

# name, command, the paths the stage owns (restore scope), validator key
STAGES = [
    ("directory", [PY, "scripts/prerender_directory.py"],
     ["handicappers/index.html", "leaderboards/index.html", "index.html"], "directory"),
    ("home_snapshot", [NODE, "scripts/prerender_home_snapshot.cjs"], ["index.html"], "home"),
    ("home_highlights", [PY, "scripts/verify_home_highlights.py"], ["index.html"], None),
    ("profiles", [PY, "scripts/build_profile_pages.py"], ["u", "sitemap.xml", "static/prerender"], None),
    ("forum", [PY, "scripts/build_forum_threads.py"], ["forum", "sitemap.xml"], None),
    ("asset_refs", [PY, "scripts/version_static_refs.py"], ["."], None),
]
GATES = [
    ("seo_indexability", [NODE, "tests/seo-indexability-regression-test.js"]),
    ("u_edge_fallback", [NODE, "tests/u-profile-edge-fallback-test.mjs"]),
    ("gamefile_logos", [NODE, "tests/matchup-team-logo-test.js"]),
]
# Everything the commit step publishes (mirrors the workflow's git add).
PUBLISH_ROOTS = ["handicappers/index.html", "leaderboards/index.html", "index.html",
                 "u", "forum", "sitemap.xml", "static/prerender"]


def git(*args, check=True, input_bytes=None):
    p = subprocess.run(["git", *args], cwd=ROOT, input=input_bytes,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {p.stderr.decode(errors='replace')[:400]}")
    return p.stdout


def existing(paths):
    return [p for p in paths if p == "." or os.path.exists(os.path.join(ROOT, p))]


def stage_all():
    """Record the current worktree as the last good state (the index)."""
    roots = existing(PUBLISH_ROOTS)
    if roots:
        git("add", "-A", "--", *roots)
    git("add", "-u")
    return git("write-tree").decode().strip()


def restore(paths):
    """Put the given paths back to the index (last good) and drop new untracked files."""
    roots = existing(paths)
    if not roots:
        return
    git("checkout", "--", *roots, check=False)
    cleanable = [p for p in roots if p != "."]
    if cleanable:
        git("clean", "-fdq", "--", *cleanable, check=False)


def run_cmd(cmd, env, timeout):
    t0 = time.time()
    try:
        p = subprocess.run(cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           timeout=timeout)
        out = p.stdout.decode("utf-8", "replace")
        code = p.returncode
    except subprocess.TimeoutExpired as ex:
        out = (ex.stdout or b"").decode("utf-8", "replace") + f"\n[timeout after {timeout}s]"
        code = 124
    except FileNotFoundError as ex:
        out, code = f"{ex}", 127
    return code, out, round(time.time() - t0, 1)


def tail_reason(out, lines=4):
    keep = [l.strip() for l in out.splitlines() if l.strip()]
    flagged = [l for l in keep if any(k in l for k in ("FAIL", "Error", "ERROR", "ABORT", "refus", "Traceback", "timeout"))]
    pick = flagged[-lines:] if flagged else keep[-lines:]
    return " | ".join(pick)[:600]


def validate(kind):
    """Per-file problems for a stage's cached rank output: {file: [problems]}."""
    import verify_cached_ranks as v
    files = {"directory": ["leaderboards/index.html", "handicappers/index.html"], "home": ["index.html"]}[kind]
    out = {}
    for rel in files:
        try:
            with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
                text = f.read()
            problems = v.CHECKS[rel](text)
        except Exception as ex:
            problems = [f"could not verify: {type(ex).__name__}: {ex}"]
        if problems:
            out[rel] = problems
    return out


def main():
    only = None
    for a in sys.argv[1:]:
        if a.startswith("--only="):
            only = set(a.split("=", 1)[1].split(","))
    skip_gates = "--skip-gates" in sys.argv

    started = time.time()
    report_file = tempfile.NamedTemporaryFile(prefix="prerender-", suffix=".jsonl", delete=False).name
    env = dict(os.environ, PRERENDER_REPORT_FILE=report_file, PYTHONUNBUFFERED="1")
    stage_results = []       # dicts: name, status, seconds, reason
    warnings = []
    trees = [stage_all()]    # trees[i] = index after i successful stages (0 = start)
    tree_of_stage = {}       # stage name -> (tree before, tree after)

    for name, cmd, owns, validator in STAGES:
        if only and name not in only:
            continue
        before = trees[-1]
        print(f"\n=== stage {name}: {' '.join(cmd)}", flush=True)
        code, out, secs = run_cmd(cmd, env, STAGE_TIMEOUT_S)
        print(out[-6000:], flush=True)
        if code != 0:
            restore(owns)
            reason = f"exit {code}: {tail_reason(out)}"
            stage_results.append({"name": name, "status": "failed", "seconds": secs, "reason": reason})
            print(f"--- stage {name} FAILED, its files were restored to the last good version: {reason}", flush=True)
            continue
        if validator:
            bad = validate(validator)
            for rel, problems in bad.items():
                restore([rel])
                reason = "; ".join(problems[:4])
                warnings.append(f"{name}: {rel} restored to last good version, baked ranks did not match the live API: {reason}")
                with open(report_file, "a", encoding="utf-8") as f:
                    f.write(json.dumps({"stage": name, "page": rel, "status": "failed",
                                        "reason": "rank verification failed: " + reason}) + "\n")
        after = stage_all()
        trees.append(after)
        tree_of_stage[name] = (before, after)
        stage_results.append({"name": name, "status": "ok", "seconds": secs, "reason": ""})

    gate_results = []
    if not skip_gates:
        for gname, gcmd in GATES:
            print(f"\n=== gate {gname}", flush=True)
            code, out, secs = run_cmd(gcmd, env, 300)
            if code == 0:
                gate_results.append({"name": gname, "status": "ok", "seconds": secs, "reason": ""})
                continue
            first_reason = tail_reason(out)
            print(out[-3000:], flush=True)
            culprit = None
            for sname, (tb, ta) in reversed(list(tree_of_stage.items())):
                if tb == ta:
                    continue
                patch = git("diff", "--binary", tb, ta)
                git("apply", "--index", "-R", "--whitespace=nowarn", input_bytes=patch, check=False)
                c2, _, _ = run_cmd(gcmd, env, 300)
                if c2 == 0:
                    culprit = sname
                    break
                git("apply", "--index", "--whitespace=nowarn", input_bytes=patch, check=False)
            if culprit:
                # Stays reverted: later gates must not re-apply or re-test it.
                tree_of_stage.pop(culprit, None)
                for s in stage_results:
                    if s["name"] == culprit:
                        s["status"] = "failed"
                        s["reason"] = f"gate {gname} failed on this stage's output (reverted to last good): {first_reason}"
                gate_results.append({"name": gname, "status": "ok after revert", "seconds": secs,
                                     "reason": f"caused by stage {culprit}; that stage's output was reverted"})
            else:
                gate_results.append({"name": gname, "status": "pre-existing", "seconds": secs,
                                     "reason": "fails with every change from this run reversed, so it is already in the repository: " + first_reason})
                warnings.append(f"gate {gname} failure is pre-existing (not caused by this run): {first_reason}")

    # ---- report ----------------------------------------------------------------
    pages = []
    if os.path.exists(report_file):
        with open(report_file, encoding="utf-8") as f:
            for line in f:
                try:
                    pages.append(json.loads(line))
                except ValueError:
                    pass
    # A validator failure supersedes the generator's own "ok" for that page.
    final = {}
    for p in pages:
        key = (p["stage"], p["page"])
        if key not in final or p["status"] != "ok":
            final[key] = p
    page_list = list(final.values())
    ok_n = sum(1 for p in page_list if p["status"] == "ok")
    kept = [p for p in page_list if p["status"] == "kept"]
    failed = [p for p in page_list if p["status"] == "failed"]
    stage_failed = [s for s in stage_results if s["status"] == "failed"]
    duration = round(time.time() - started, 1)

    lines = ["## Prerender run", "",
             f"Duration: {duration}s. Pages attempted {len(page_list)}, succeeded {ok_n}, "
             f"kept previous version {len(kept)}, failed {len(failed)}. "
             f"Stages failed {len(stage_failed)} of {len(stage_results)}.", "",
             "| stage | status | seconds | reason |", "|---|---|---|---|"]
    for s in stage_results + gate_results:
        lines.append(f"| {s['name']} | {s['status']} | {s['seconds']} | {s['reason'][:300].replace('|', '/')} |")
    if failed or kept:
        lines += ["", "| page | status | reason |", "|---|---|---|"]
        for p in failed + kept:
            lines.append(f"| {p['stage']} {p['page']} | {p['status']} | {p['reason'][:300].replace('|', '/')} |")
    if warnings:
        lines += ["", "Warnings:"] + [f"- {w[:400]}" for w in warnings]
    text = "\n".join(lines)
    print("\n" + text, flush=True)

    for p in failed:
        print(f"::error title=Prerender page failed::{p['stage']} {p['page']}: {p['reason'][:300]}")
    for s in stage_failed:
        print(f"::error title=Prerender stage failed::{s['name']}: {s['reason'][:300]}")
    for p in kept:
        print(f"::warning title=Prerender page kept previous version::{p['stage']} {p['page']}: {p['reason'][:300]}")
    for w in warnings:
        print(f"::warning title=Prerender warning::{w[:300]}")

    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
            f.write(text + "\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write(f"pages_attempted={len(page_list)}\npages_ok={ok_n}\npages_kept={len(kept)}\n"
                    f"pages_failed={len(failed)}\nstages_failed={len(stage_failed)}\n"
                    f"errors={len(failed) + len(stage_failed)}\n")
    with open(os.path.join(tempfile.gettempdir(), "prerender-last-report.json"), "w", encoding="utf-8") as f:
        json.dump({"duration": duration, "stages": stage_results, "gates": gate_results,
                   "pages": page_list, "warnings": warnings}, f, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
