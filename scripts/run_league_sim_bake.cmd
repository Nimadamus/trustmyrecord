@echo off
REM NBA_NHL_SIM_CLUSTER_20260915: daily bake of the NBA and NHL season and playoff
REM simulator pages, the hub blocks and the team page projections, from the live
REM season inputs API. Fail closed: any non-zero exit stops before the commit and
REM leaves the last good bake live. Same shape as run_mlb_bake.cmd.
setlocal
cd /d C:\Users\BL\tmrfe-league-sim || exit /b 1
set LOG=C:\Users\BL\tmrfe-league-sim\_league_sim_bake.log
echo ---- %DATE% %TIME% >> "%LOG%"

git fetch origin -q                                        || goto :fail
git reset -q --hard origin/main                            >> "%LOG%" 2>&1 || goto :fail
REM NHL_PAGE_DATA_20261006: the NHL matchup and team pages from a fresh NHL
REM snapshot (injuries, goalies, this season). Never fails the bake: any error
REM leaves those pages exactly as committed. See scripts\refresh_nhl_sim_pages.py.
call :nhl_pages
node scripts\build_league_sim_pages.js                     >> "%LOG%" 2>&1 || goto :fail
node scripts\build_nfl_season_page.js                      >> "%LOG%" 2>&1 || goto :fail
node scripts\build_nfl_team_pages.js                       >> "%LOG%" 2>&1 || goto :fail
node scripts\build_mlb_odds_page.js                        >> "%LOG%" 2>&1 || goto :fail
REM PLAYOFF_BRACKET_20260929: never fails the bake; on bad inputs it leaves the last bake live.
node scripts\build_nfl_playoff_page.js                     >> "%LOG%" 2>&1
node tests\playoff-bracket-test.js                         >> "%LOG%" 2>&1 || goto :fail
node tests\league-season-engine-test.js                    >> "%LOG%" 2>&1 || goto :fail
node tests\mlb-postseason-odds-test.js                     >> "%LOG%" 2>&1 || goto :fail
node tests\seo-indexability-regression-test.js             >> "%LOG%" 2>&1 || goto :fail

git add mlb-playoff-odds mlb-simulator data/mlb-playoff-odds-inputs.json nfl-season-simulator nfl-simulator nfl-playoff-simulator sitemap.xml nba-season-simulator nba-playoff-simulator nhl-season-simulator nhl-playoff-simulator nba-simulator nhl-simulator >> "%LOG%" 2>&1
git diff --cached --quiet && (echo no change >> "%LOG%" & goto :done)
git commit -q -m "chore(sims): bake NBA and NHL season and playoff simulators [skip ci]" >> "%LOG%" 2>&1 || goto :fail
git fetch origin -q                                        || goto :fail
git rebase origin/main                                     >> "%LOG%" 2>&1 || goto :fail
git push -q origin HEAD:main                               >> "%LOG%" 2>&1 || (
  git fetch origin -q                                      >> "%LOG%" 2>&1
  git rebase origin/main                                   >> "%LOG%" 2>&1 || goto :fail
  git push -q origin HEAD:main                             >> "%LOG%" 2>&1 || goto :fail
)
echo pushed >> "%LOG%"
:done
echo OK >> "%LOG%"
exit /b 0
:fail
echo FAILED, nothing published >> "%LOG%"
git rebase --abort >nul 2>&1
exit /b 1

:nhl_pages
set BE=C:\Users\BL\tmrbe-sim-bake
set NODE_PATH=C:\Users\BL\tmr-be-master\node_modules
set PY=C:\Users\BL\AppData\Local\Programs\Python\Python310\python.exe
if not exist "%BE%\.git" (echo nhl pages: no backend worktree, skipped >> "%LOG%" & exit /b 0)
git -C "%BE%" fetch origin -q                              >> "%LOG%" 2>&1 || exit /b 0
git -C "%BE%" reset -q --hard origin/master                >> "%LOG%" 2>&1 || exit /b 0
node "%BE%\scripts\build_nhl_snapshot.js"                 >> "%LOG%" 2>&1 || (echo nhl pages: snapshot failed, kept >> "%LOG%" & exit /b 0)
node scripts\build_sim_matchup_pages.js --backend "%BE%"   >> "%LOG%" 2>&1 || goto :nhl_undo
node scripts\build_sim_team_pages.js --backend "%BE%"      >> "%LOG%" 2>&1 || goto :nhl_undo
git checkout -q -- nba-simulator nhl-simulator/index.html scripts/sim-matchup-urls.txt scripts/sim-team-urls.txt >> "%LOG%" 2>&1
"%PY%" scripts\refresh_nhl_sim_pages.py                    >> "%LOG%" 2>&1 || goto :nhl_undo
exit /b 0
:nhl_undo
echo nhl pages: refresh failed, kept as committed >> "%LOG%"
git checkout -q -- nba-simulator nhl-simulator scripts/sim-matchup-urls.txt scripts/sim-team-urls.txt >> "%LOG%" 2>&1
exit /b 0
