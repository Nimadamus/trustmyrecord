"""
prerender_report.py - page-level result lines for the prerender run.

PRERENDER_ISOLATION_20260915. Every generator records each page it tries to
build here, so scripts/prerender_run.py can report pages attempted, succeeded
and failed (with the reason) at the end of a run, and one bad page is visible
without having aborted everything else.

When PRERENDER_REPORT_FILE is unset (a generator run by hand) record() is a
no-op apart from printing, so every script still works standalone.

status:
  ok      the page was rebuilt
  kept    the page could not be rebuilt and the previous good version was kept
          (e.g. a rate-limited fetch): logged as a warning
  failed  the page could not be rebuilt and nothing was written for it: logged
          as an error
"""
import json
import os
import sys
import time


def record(stage, page, status, reason=""):
    line = {"t": round(time.time(), 3), "stage": stage, "page": page,
            "status": status, "reason": str(reason or "")[:500]}
    path = os.environ.get("PRERENDER_REPORT_FILE")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(line) + "\n")
    if status != "ok":
        print(f"  [{status}] {stage} {page}: {line['reason']}", file=sys.stderr)
