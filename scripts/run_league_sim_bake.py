"""run_league_sim_bake.py -- the NBA/NHL/NFL/MLB simulator page bake, with
observability (BAKE_RUNNER_20261007). Same steps, order and fail-closed rule as the
.cmd it replaces; what is new is that a run can always be diagnosed:

  - one lock (PID file): a second run while the first is alive refuses and logs it;
    a lock left by a dead process is taken over and the death is logged;
  - a state file written at every stage: stage, start time, whether anything has
    been pushed yet;
  - a heartbeat line every 60 s during long steps;
  - a self-imposed budget (40 min, under Task Scheduler's 45): the runner stops the
    step, logs TIMEOUT with the stage, and publishes nothing;
  - at start, the previous run's state is read: a run that never wrote its end is
    logged as DIED (TIMEOUT if it ran past the budget, KILLED otherwise) with its
    stage and whether it had published.

Publishing happens in exactly one place (git push at the end, after every test). A
run that dies anywhere before it leaves origin, and therefore the live pages, as
they were. Every run starts with git reset --hard origin/main, so a retry is clean.

  python scripts/run_league_sim_bake.py
"""
import datetime as dt
import json
import os
import subprocess
import sys
import threading
import time

ROOT = r'C:\Users\BL\tmrfe-league-sim'
LOG = os.path.join(ROOT, '_league_sim_bake.log')
STATE = os.path.join(ROOT, '_league_sim_bake_state.json')
LOCK = os.path.join(ROOT, '_league_sim_bake.lock')
BUDGET_S = int(os.environ.get('BAKE_BUDGET_S', 40 * 60))
HEARTBEAT_S = 60
NODE = 'node'
GIT = 'git'

ADD = ['mlb-playoff-odds', 'mlb-simulator', 'data/mlb-playoff-odds-inputs.json', 'nfl-season-simulator', 'nfl-simulator',
       'nfl-playoff-simulator', 'sitemap.xml', 'nba-season-simulator', 'nba-playoff-simulator', 'nhl-season-simulator',
       'nhl-playoff-simulator', 'nba-simulator', 'nhl-simulator']

START = time.time()
state = {}


def now():
    return dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')


LOG_LOCK = threading.Lock()


def log(msg):
    with LOG_LOCK, open(LOG, 'a', encoding='utf-8') as f:
        f.write(msg + '\n')


def pump(stream):
    """Copy a step's output into the log line by line. A child given the log file as
    its stdout writes at its own file offset on Windows and overwrote the runner's
    heartbeat lines (17:26 run: one heartbeat survived of about eight)."""
    for raw in iter(stream.readline, b''):
        log(raw.decode('utf-8', 'replace').rstrip('\r\n'))
    stream.close()


def save(**kw):
    state.update(kw)
    tmp = STATE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f)
    os.replace(tmp, STATE)


def alive(pid):
    try:
        out = subprocess.run(['tasklist', '/FI', 'PID eq %d' % pid, '/NH'], capture_output=True, text=True, timeout=20).stdout
        return str(pid) in out
    except Exception:
        return True   # unknown: assume alive, never run twice


class Stop(Exception):
    pass


def run(stage, cmd, fatal=True):
    """Run one step with heartbeat and the run budget. Returns the exit code."""
    save(stage=stage, stage_started=now())
    log('[stage] %s start %s' % (stage, now()))
    t0 = time.time()
    p = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    reader = threading.Thread(target=pump, args=(p.stdout,), daemon=True)
    reader.start()
    last_beat = t0
    while True:
        try:
            rc = p.wait(timeout=5)
            break
        except subprocess.TimeoutExpired:
            if time.time() - START > BUDGET_S:
                p.kill()
                p.wait()
                reader.join(10)
                raise Stop('TIMEOUT')
            if time.time() - last_beat >= HEARTBEAT_S:
                last_beat = time.time()
                log('[heartbeat] %s still running after %ds (run %ds)' % (stage, int(time.time() - t0), int(time.time() - START)))
    reader.join(30)
    log('[stage] %s end rc=%d %ds' % (stage, rc, int(time.time() - t0)))
    if rc != 0 and fatal:
        raise Stop('FAILED')
    return rc


def nhl_pages():
    """NHL_PAGE_DATA_20261006: matchup and team pages from a fresh NHL snapshot. Never fatal."""
    be = r'C:\Users\BL\tmrbe-sim-bake'
    env_ok = os.path.exists(os.path.join(be, '.git'))   # a worktree's .git is a file
    if not env_ok:
        log('nhl pages: no backend worktree, skipped')
        return
    os.environ['NODE_PATH'] = r'C:\Users\BL\tmr-be-master\node_modules'
    steps = [('nhl: backend fetch', [GIT, '-C', be, 'fetch', 'origin', '-q']),
             ('nhl: backend reset', [GIT, '-C', be, 'reset', '-q', '--hard', 'origin/master']),
             ('nhl: snapshot', [NODE, os.path.join(be, 'scripts', 'build_nhl_snapshot.js')]),
             ('nhl: matchup pages', [NODE, r'scripts\build_sim_matchup_pages.js', '--backend', be]),
             ('nhl: team pages', [NODE, r'scripts\build_sim_team_pages.js', '--backend', be])]
    for name, cmd in steps:
        if run(name, cmd, fatal=False) != 0:
            log('nhl pages: %s failed, kept as committed' % name)
            run('nhl: undo', [GIT, 'checkout', '-q', '--', 'nba-simulator', 'nhl-simulator', 'scripts/sim-matchup-urls.txt', 'scripts/sim-team-urls.txt'], fatal=False)
            return
    run('nhl: keep only nhl data', [GIT, 'checkout', '-q', '--', 'nba-simulator', 'nhl-simulator/index.html', 'scripts/sim-matchup-urls.txt', 'scripts/sim-team-urls.txt'], fatal=False)
    if run('nhl: splice', [sys.executable, r'scripts\refresh_nhl_sim_pages.py'], fatal=False) != 0:
        log('nhl pages: refresh failed, kept as committed')
        run('nhl: undo', [GIT, 'checkout', '-q', '--', 'nba-simulator', 'nhl-simulator', 'scripts/sim-matchup-urls.txt', 'scripts/sim-team-urls.txt'], fatal=False)


def main():
    log('---- %s (runner pid %d)' % (now(), os.getpid()))
    # 1. Lock: never two runs at once.
    if os.path.exists(LOCK):
        try:
            other = int(open(LOCK).read().strip() or 0)
        except Exception:
            other = 0
        if other and other != os.getpid() and alive(other):
            log('REFUSED %s: run pid %d is still alive' % (now(), other))
            return 3
        log('lock left by pid %d, which is gone; taking it over' % other)
    with open(LOCK, 'w') as f:
        f.write(str(os.getpid()))
    # 2. What happened to the previous run?
    try:
        prev = json.load(open(STATE, encoding='utf-8'))
        if prev.get('result') is None and prev.get('started'):
            began = dt.datetime.strptime(prev['started'], '%Y-%m-%d %H:%M:%S')
            ran = (dt.datetime.now() - began).total_seconds()
            kind = 'TIMEOUT' if ran >= BUDGET_S else 'KILLED'
            log('PREVIOUS RUN DIED (%s): started %s, last stage "%s" at %s, published=%s' % (
                kind, prev['started'], prev.get('stage'), prev.get('stage_started'), prev.get('published', False)))
    except FileNotFoundError:
        pass
    except Exception as e:
        log('previous state unreadable: %s' % e)
    state.clear()
    save(started=now(), pid=os.getpid(), stage='start', published=False, result=None)
    result = 'OK'
    try:
        run('fetch', [GIT, 'fetch', 'origin', '-q'])
        run('reset', [GIT, 'reset', '-q', '--hard', 'origin/main'])
        nhl_pages()
        run('league pages', [NODE, r'scripts\build_league_sim_pages.js'])
        run('nfl season page', [NODE, r'scripts\build_nfl_season_page.js'])
        run('nfl team pages', [NODE, r'scripts\build_nfl_team_pages.js'])
        run('mlb odds page', [NODE, r'scripts\build_mlb_odds_page.js'])
        run('nfl playoff page', [NODE, r'scripts\build_nfl_playoff_page.js'], fatal=False)
        for t in ['playoff-bracket-test.js', 'league-season-engine-test.js', 'mlb-postseason-odds-test.js', 'seo-indexability-regression-test.js']:
            run('test ' + t, [NODE, 'tests\\' + t])
        run('git add', [GIT, 'add'] + ADD)
        if subprocess.run([GIT, 'diff', '--cached', '--quiet'], cwd=ROOT).returncode == 0:
            log('no change')
            result = 'OK (no change)'
        else:
            run('commit', [GIT, 'commit', '-q', '-m', 'chore(sims): bake NBA and NHL season and playoff simulators [skip ci]'])
            pushed = False
            for attempt in (1, 2):
                run('fetch before push', [GIT, 'fetch', 'origin', '-q'])
                run('rebase', [GIT, 'rebase', 'origin/main'])
                if run('push attempt %d' % attempt, [GIT, 'push', '-q', 'origin', 'HEAD:main'], fatal=False) == 0:
                    pushed = True
                    break
            if not pushed:
                raise Stop('FAILED')
            sha = subprocess.run([GIT, 'rev-parse', '--short=11', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
            files = subprocess.run([GIT, 'show', '--name-only', '--format=', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.split()
            save(published=True, commit=sha, files_changed=len(files))
            log('pushed %s, %d files changed' % (sha, len(files)))
    except Stop as e:
        result = str(e)
        subprocess.run([GIT, 'rebase', '--abort'], cwd=ROOT, capture_output=True)
    except Exception as e:
        result = 'FAILED'
        log('runner error: %r' % e)
    dur = int(time.time() - START)
    save(result=result, finished=now(), duration_s=dur)
    if result.startswith('OK'):
        log('%s finished %s duration %ds' % (result, now(), dur))
    else:
        log('%s at %s during stage "%s" after %ds; published=%s (if false, the live pages are the previous good bake)' % (
            result, now(), state.get('stage'), dur, state.get('published')))
    try:
        os.remove(LOCK)
    except Exception:
        pass
    return 0 if result.startswith('OK') else 1


if __name__ == '__main__':
    sys.exit(main())
