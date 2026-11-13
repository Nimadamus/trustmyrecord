"""COACH_EXPERIENCE_INT_20261113: ESPN's coach "experience" can be a dict, a bare number or missing.
The bare number crashed the hub bake for every sport on 11/13/2026. No network."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "scripts"))
import ncaaf_hub as H

def run(experience, record={"summary": "8-2"}):
    coach = {"displayName": "Test Coach", "record": record}
    if experience != "absent":
        coach["experience"] = experience
    H._get = lambda url: {"items": [{"$ref": "coach-1"}]} if "coaches" in str(url) else coach
    H._ref = lambda item: item.get("$ref") if isinstance(item, dict) else item
    return H.coach(99, 2026)

cases = [({"years": 7}, 7), (7, 7), (0, 0), ("absent", None), (None, None), ("seven", None), (True, None), ({}, None)]
for exp, want in cases:
    got = run(exp)
    assert got["years"] == want, (exp, got)
    assert got["name"] == "Test Coach" and got["record"] == "8-2"
assert run(7, record=None)["record"] is None
H._get = lambda url: {"items": [{"$ref": "c"}]} if "coaches" in str(url) else {"firstName": "Matt", "lastName": "Campbell", "experience": 3, "records": []}
got = H.coach(213, 2026)
assert got == {"name": "Matt Campbell", "years": 3, "record": None}, got   # the shape ESPN serves today
print("ncaaf_coach_experience_test: %d passed" % (len(cases) + 2))
