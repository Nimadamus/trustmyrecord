#!/usr/bin/env python3
"""
PRERENDER_ISOLATION_20260915 regression test for scripts/prerender_run.py.

Builds a throwaway git repository with a fake "last good" bake, then drives the
real orchestrator with stand-in stages and gates:

  good      rewrites leaderboards/index.html                     -> published
  broken    half-writes handicappers/index.html, exits 1          -> restored, run continues
  after     rewrites u/alice/index.html after the broken stage    -> still published
  gatebad   writes forum/x/index.html that a gate rejects         -> reverted, marked failed
  gate_pre  a gate that fails on untouched repository content     -> warning only

and asserts: one failure never aborts the run, a failed stage's page keeps its
last good bytes, a gate failure is pinned to the stage that caused it, a
pre-existing gate failure does not revert good pages, and the report counts
every page.

  python tests/prerender-run-isolation-test.py
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

spec = importlib.util.spec_from_file_location("prerender_run", os.path.join(REPO, "scripts", "prerender_run.py"))
pr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pr)

failures = []


def check(cond, msg):
    print(("  ok    " if cond else "  FAIL  ") + msg)
    if not cond:
        failures.append(msg)


def sh(cwd, *args):
    subprocess.run(args, cwd=cwd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def write(root, rel, text):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def read(root, rel):
    with open(os.path.join(root, rel), encoding="utf-8") as f:
        return f.read()


tmp = tempfile.mkdtemp(prefix="prerender-iso-")
try:
    sh(tmp, "git", "init", "-q")
    sh(tmp, "git", "config", "user.email", "t@example.com")
    sh(tmp, "git", "config", "user.name", "t")
    write(tmp, "leaderboards/index.html", "LB good v1\n")
    write(tmp, "handicappers/index.html", "HM good v1\n")
    write(tmp, "u/alice/index.html", "alice v1\n")
    write(tmp, "legacy/broken.txt", "pre-existing bad content\n")
    sh(tmp, "git", "add", "-A")
    sh(tmp, "git", "commit", "-q", "-m", "last good bake")

    py = sys.executable
    rec = ("import json,os,sys;"
           "open(os.environ['PRERENDER_REPORT_FILE'],'a').write(json.dumps("
           "{'stage':sys.argv[1],'page':sys.argv[2],'status':sys.argv[3],'reason':sys.argv[4]})+'\\n')")
    def stage(code):
        return [py, "-c", code]

    pr.ROOT = tmp
    pr.PUBLISH_ROOTS = ["leaderboards/index.html", "handicappers/index.html", "u", "forum"]
    pr.STAGES = [
        ("good", stage("open('leaderboards/index.html','w').write('LB good v2\\n');" + rec.replace("sys.argv[1]", "'good'").replace("sys.argv[2]", "'/leaderboards/'").replace("sys.argv[3]", "'ok'").replace("sys.argv[4]", "''")),
         ["leaderboards/index.html"], None),
        ("broken", stage("open('handicappers/index.html','w').write('');import os;os.makedirs('handicappers/junk',exist_ok=True);open('handicappers/junk/x.html','w').write('x');raise SystemExit(1)"),
         ["handicappers"], None),
        ("after", stage("open('u/alice/index.html','w').write('alice v2\\n');" + rec.replace("sys.argv[1]", "'after'").replace("sys.argv[2]", "'/u/alice/'").replace("sys.argv[3]", "'ok'").replace("sys.argv[4]", "''")
                         + ";" + rec.replace("sys.argv[1]", "'after'").replace("sys.argv[2]", "'/u/bob/'").replace("sys.argv[3]", "'kept'").replace("sys.argv[4]", "'fetch failed: HTTP 429'")),
         ["u"], None),
        ("gatebad", stage("import os;os.makedirs('forum/x',exist_ok=True);open('forum/x/index.html','w').write('NOINDEX\\n')"),
         ["forum"], None),
    ]
    gate_forum = "import os,sys;p='forum/x/index.html';sys.exit(1 if os.path.exists(p) and 'NOINDEX' in open(p).read() else 0)"
    gate_pre = "import sys;sys.exit(1 if 'bad' in open('legacy/broken.txt').read() else 0)"
    pr.GATES = [("forum_indexable", [py, "-c", gate_forum]), ("legacy_guard", [py, "-c", gate_pre])]

    old_argv = sys.argv
    sys.argv = ["prerender_run.py"]
    out_summary = os.path.join(tmp, "summary.md")
    out_vars = os.path.join(tmp, "outputs.txt")
    os.environ["GITHUB_STEP_SUMMARY"] = out_summary
    os.environ["GITHUB_OUTPUT"] = out_vars
    try:
        code = pr.main()
    finally:
        sys.argv = old_argv
    report = json.load(open(os.path.join(tempfile.gettempdir(), "prerender-last-report.json"), encoding="utf-8"))
    stages = {s["name"]: s for s in report["stages"]}
    gates = {g["name"]: g for g in report["gates"]}

    print("\nisolation")
    check(code == 0, "the orchestrator finishes the run (exit 0) despite failures")
    check(read(tmp, "leaderboards/index.html") == "LB good v2\n", "a good stage before a failure is published")
    check(read(tmp, "handicappers/index.html") == "HM good v1\n", "the failed stage's page keeps its last good bytes (never the empty write)")
    check(not os.path.exists(os.path.join(tmp, "handicappers/junk/x.html")), "new files from the failed stage are removed")
    check(read(tmp, "u/alice/index.html") == "alice v2\n", "a stage after the failure still runs and is published")
    check(stages["broken"]["status"] == "failed" and "exit 1" in stages["broken"]["reason"], "the failed stage is reported with its exit reason")

    print("\ngates")
    check(not os.path.exists(os.path.join(tmp, "forum/x/index.html")), "output a gate rejects is reverted")
    check(stages["gatebad"]["status"] == "failed" and "forum_indexable" in stages["gatebad"]["reason"], "the gate failure is pinned to the stage that caused it")
    check(gates["forum_indexable"]["status"] == "ok after revert", "the gate passes once that stage is reverted")
    check(gates["legacy_guard"]["status"] == "pre-existing", "a gate failing on untouched content is classed pre-existing")
    check(read(tmp, "leaderboards/index.html") == "LB good v2\n" and read(tmp, "u/alice/index.html") == "alice v2\n",
          "a pre-existing gate failure does not revert good pages")

    print("\nobservability")
    pages = {(p["stage"], p["page"]): p["status"] for p in report["pages"]}
    check(pages.get(("after", "/u/bob/")) == "kept", "a page that kept its previous version is reported as kept")
    summary = open(out_summary, encoding="utf-8").read()
    check("Pages attempted 3, succeeded 2, kept previous version 1, failed 0" in summary, "the summary counts pages attempted, succeeded, kept and failed")
    check("Duration:" in summary and "| broken | failed |" in summary, "the summary carries the duration and each stage's status")
    outputs = open(out_vars, encoding="utf-8").read()
    check("stages_failed=2" in outputs and "errors=2" in outputs, "step outputs expose the error count for the final fail step")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print("")
if failures:
    print(f"PRERENDER RUN ISOLATION TEST FAILED ({len(failures)})")
    sys.exit(1)
print("prerender run isolation: every check passed")
