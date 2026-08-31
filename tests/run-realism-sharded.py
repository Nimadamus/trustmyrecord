#!/usr/bin/env python
"""Run the FULL 12,000-simulation MLB realism suite as a pool of shards.

WHY: one sequential process needs about 3.7 hours (measured: ~1.1s per
simulated game), which no command runner will sit through, so the suite was
effectively never run to a verdict. mlb-simulator-realism-test.js already knows
how to run one slice of the work and write its raw totals
(TMR_MLB_SHARDS / TMR_MLB_SHARD / TMR_MLB_SHARD_OUT); this driver runs every
slice and mlb-simulator-realism-aggregate.js turns them back into the same
assertions over the same twelve thousand games.

Nothing about the sample is reduced. 24 shards x 500 simulations = 12,000, the
union of `i % 24 == k` over k is exactly 0..11999, and the aggregator refuses to
report unless all 24 payloads are present and their `ran` counts sum to the full
total.

  python tests/run-realism-sharded.py [--shards 24] [--workers 5] [--out DIR]

Resumable: a shard whose JSON already exists is skipped, so an interrupted run
picks up where it stopped instead of starting the 3.7 hours again.
"""
import argparse
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CREATE_NO_WINDOW = 0x08000000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shards", type=int, default=24)
    ap.add_argument("--workers", type=int, default=5)
    ap.add_argument("--out", default=os.path.join(ROOT, ".realism-shards"))
    ap.add_argument("--sims", type=int, default=0, help="override TMR_MLB_SIMS (calibration only)")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    log = open(os.path.join(args.out, "driver.log"), "a", buffering=1, encoding="utf-8")

    def say(msg):
        line = time.strftime("%H:%M:%S") + " " + msg
        log.write(line + "\n")
        print(line, flush=True)

    pending = []
    for k in range(args.shards):
        dest = os.path.join(args.out, "shard-%02d.json" % k)
        if os.path.exists(dest) and os.path.getsize(dest) > 2:
            say("shard %d already complete, skipping" % k)
            continue
        pending.append((k, dest))

    say("start: %d shards to run, %d workers, out=%s" % (len(pending), args.workers, args.out))
    started = time.time()
    running = []
    failures = []

    while pending or running:
        while pending and len(running) < args.workers:
            k, dest = pending.pop(0)
            env = dict(os.environ)
            env["TMR_MLB_SHARDS"] = str(args.shards)
            env["TMR_MLB_SHARD"] = str(k)
            env["TMR_MLB_SHARD_OUT"] = dest
            if args.sims:
                env["TMR_MLB_SIMS"] = str(args.sims)
            errf = open(os.path.join(args.out, "shard-%02d.log" % k), "w", encoding="utf-8")
            p = subprocess.Popen(
                ["node", os.path.join(ROOT, "tests", "mlb-simulator-realism-test.js")],
                cwd=ROOT, env=env, stdout=errf, stderr=subprocess.STDOUT,
                creationflags=CREATE_NO_WINDOW,
            )
            running.append((k, dest, p, errf, time.time()))
            say("launched shard %d (pid %d)" % (k, p.pid))

        time.sleep(5)
        for item in list(running):
            k, dest, p, errf, t0 = item
            if p.poll() is None:
                continue
            running.remove(item)
            errf.close()
            secs = int(time.time() - t0)
            if p.returncode == 0 and os.path.exists(dest):
                say("shard %d done in %ds" % (k, secs))
            else:
                failures.append(k)
                say("shard %d FAILED rc=%s after %ds (see shard-%02d.log)" % (k, p.returncode, secs, k))

    say("all shards finished in %ds; failures=%s" % (int(time.time() - started), failures or "none"))
    with open(os.path.join(args.out, "DONE"), "w", encoding="utf-8") as f:
        json.dump({"failures": failures, "shards": args.shards,
                   "seconds": int(time.time() - started)}, f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
