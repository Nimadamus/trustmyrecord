#!/usr/bin/env bash
# SEO_GATE_NEW_ONLY_20261019. The bake gates fail only on SEO problems THIS bake adds.
# 10-19: a staging page another session pushed with noindex failed the site-wide
# gate, and every MLB and sport hub bake was discarded for hours although the bakes
# themselves were clean. Problems already on main before the bake are printed as a
# warning (and the push-time Regression Lock still fails on them); new ones fail the bake.
#   scripts/seo_gate_new_only.sh baseline   before the bake writes anything
#   scripts/seo_gate_new_only.sh gate       after the bake, before the commit
set -u
T=tests/seo-indexability-regression-test.js
B=/tmp/seo_gate_before.txt
case "${1:-}" in
  baseline)
    node "$T" > "$B" 2>&1 || true
    grep -a '^  FAIL' "$B" || echo "baseline clean"
    exit 0 ;;
  gate)
    if node "$T" > /tmp/seo_gate_after.txt 2>&1; then echo "SEO gate clean"; exit 0; fi
    grep -a '^  FAIL' /tmp/seo_gate_after.txt | sort -u > /tmp/seo_a.txt || true
    if [ ! -s /tmp/seo_a.txt ]; then
      tail -30 /tmp/seo_gate_after.txt; echo "::error::SEO gate crashed (no FAIL lines)"; exit 1
    fi
    if [ ! -f "$B" ]; then echo "::error::no baseline"; cat /tmp/seo_a.txt; exit 1; fi
    grep -a '^  FAIL' "$B" | sort -u > /tmp/seo_b.txt || true
    NEW=$(comm -13 /tmp/seo_b.txt /tmp/seo_a.txt)
    if [ -n "$NEW" ]; then echo "::error::this bake adds SEO problems"; echo "$NEW"; exit 1; fi
    echo "::warning::SEO problems already on main before this bake (not from it):"
    cat /tmp/seo_a.txt
    exit 0 ;;
  *) echo "usage: $0 baseline|gate"; exit 2 ;;
esac
