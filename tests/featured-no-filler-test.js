/* NO_FILLER_DOOR_20260915. Nima, 2026-09-15: "I do not ever want to see that
 * again. In a case where it wasn't able to post the newest article it should
 * still be showing the latest one."
 *
 * The page he means said "MLB handicapping: every game on the board / The next
 * featured matchup publishes ahead of its kickoff". It appeared whenever a
 * sport had no game still in progress. This test fails the build, the Matchup
 * of the Day runner's pre-push gate and CI if any of these comes back:
 *
 *   1. a door baked with no article, at ANY moment, for a sport that has ever
 *      had one (checked now, and 400 days after every game has finished);
 *   2. placeholder wording in any door on disk or in the code that bakes them;
 *   3. the browser runtime leaving the visitor on the door when the registry
 *      is unreadable, empty, or names nothing live.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILLER = /every game on the board|publishes ahead of its kickoff|publishes in the morning|next featured matchup|being prepared/i;
let failures = 0;
const fail = (m) => { failures++; console.log('  FAIL  ' + m); };
const pass = (m) => console.log('  ok    ' + m);

/* 1. Every door the registry bakes, now and long after every game is over. */
const py = `
import json, sys, datetime as dt
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'scripts'))})
import featured_matchups as fm
reg = fm.load()
out = []
now = fm.now_utc()
for when in (now, now + dt.timedelta(days=400)):
    doors = {}
    for s in fm.managed_sports(reg):
        for d in reg["sports"][s].get("doors") or []:
            doors[d["file"].replace("\\\\", "/")] = s
    for d in reg.get("all_doors") or []:
        doors[d["file"].replace("\\\\", "/")] = "*"
    has = {s: any((f.get("status") or "active") == "active" and f.get("href") for f in reg["sports"][s].get("features") or []) for s in fm.managed_sports(reg)}
    for p, text in fm.render_surfaces(reg, now=when, root=${JSON.stringify(ROOT)}, read=lambda p: open(p, encoding="utf-8").read()):
        rel = p.replace("\\\\", "/").split(${JSON.stringify(ROOT.replace(/\\/g, '/'))} + "/")[-1]
        if rel in doors:
            out.append({"file": rel, "sport": doors[rel], "when": when.isoformat(), "text": text,
                        "has_articles": has.get(doors[rel], any(has.values()))})
print(json.dumps(out))
`;
const doors = JSON.parse(execFileSync('python', ['-c', py], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }) }));
if (!doors.length) fail('no doors rendered from data/featured-matchups.json');
for (const d of doors) {
  const label = `${d.file} at ${d.when.slice(0, 10)}`;
  if (FILLER.test(d.text)) { fail(`${label}: placeholder wording`); continue; }
  if (!d.has_articles) { pass(`${label}: sport has no article yet (forwards to hub)`); continue; }
  const baked = (d.text.match(/data-baked-href="([^"]*)"/) || [])[1];
  /* A sport hub (/handicapping/nfl/) is filler; a game's own breakdown under it
     (/handicapping/nfl/<game>/, what the NFL schedule rotation links) is an article. */
  if (!baked || !/^\/[^/]/.test(baked) || /^\/handicapping\/[^/]+\/?$/.test(baked)) fail(`${label}: baked "${baked || ''}" is not an article`);
  else pass(`${label} -> ${baked}`);
}

/* 2. Placeholder wording anywhere a door is baked from, or on a door on disk. */
const onDisk = [];
const motd = path.join(ROOT, 'matchup-of-the-day');
for (const name of fs.readdirSync(motd)) {
  const f = path.join(motd, name, 'index.html');
  if (fs.existsSync(f)) onDisk.push(f);
}
onDisk.push(path.join(ROOT, 'nfl-game-of-the-week', 'index.html'));
for (const f of onDisk.concat([path.join(ROOT, 'scripts', 'featured_matchups.py'), path.join(ROOT, 'static', 'js', 'tmr-featured.js')])) {
  if (!fs.existsSync(f)) continue;
  const text = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '');
  if (FILLER.test(text)) fail(`${path.relative(ROOT, f)} carries placeholder wording`);
}
const bake = fs.readFileSync(path.join(ROOT, 'scripts', 'build_matchup_articles.py'), 'utf8');
const empty = (bake.match(/MOTD_EMPTY_TEMPLATE = """([\s\S]*?)"""/) || [])[1] || '';
if (FILLER.test(empty) || /<main|<h1/i.test(empty)) fail('MOTD_EMPTY_TEMPLATE renders a page instead of forwarding');
pass(`${onDisk.length} doors on disk and the bake sources carry no placeholder`);

/* 3. The browser half never leaves the visitor on a door. */
const src = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-featured.js'), 'utf8');
function runDoor(registry, baked) {
  return new Promise((resolve) => {
    const went = [];
    const attrs = { 'data-tmr-featured-door': 'mlb', 'data-baked-href': baked, 'data-hub': '/handicapping/mlb/' };
    const el = { getAttribute: (k) => (k in attrs ? attrs[k] : null) };
    const win = {
      location: { pathname: '/matchup-of-the-day/mlb/', replace: (u) => went.push(u) },
      fetch: () => Promise.resolve({ ok: registry !== null, json: () => Promise.resolve(registry) }),
    };
    const doc = { readyState: 'complete', addEventListener() {} };
    vm.runInNewContext(src, { window: win, document: doc, setTimeout, clearTimeout, setInterval() {}, Date, Promise, Object, Number, String, Math, isNaN });
    win.TMRFeatured.door(el);
    setTimeout(() => resolve(went), 3000);
  });
}
const old = { sports: { mlb: { features: [
  { status: 'active', href: '/matchup-of-the-day/older/', kickoff_utc: '2020-01-01T00:00:00Z' },
  { status: 'active', href: '/matchup-of-the-day/latest/', kickoff_utc: '2020-02-01T00:00:00Z' },
] } } };
(async () => {
  const cases = [
    ['every game finished', old, '/matchup-of-the-day/baked/', '/matchup-of-the-day/latest/'],
    ['registry unreadable', null, '/matchup-of-the-day/baked/', '/matchup-of-the-day/baked/'],
    ['registry names nothing', { sports: { mlb: { features: [] } } }, '/matchup-of-the-day/baked/', '/matchup-of-the-day/baked/'],
  ];
  for (const [name, reg, baked, want] of cases) {
    const went = await runDoor(reg, baked);
    if (went[0] !== want) fail(`runtime, ${name}: went to ${JSON.stringify(went)}, expected ${want}`);
    else pass(`runtime, ${name}: opens ${want}`);
  }
  if (failures) { console.log(`\nFEATURED_NO_FILLER FAILED: ${failures} failure(s)`); process.exit(1); }
  console.log('\nFEATURED_NO_FILLER PASSED');
})();
