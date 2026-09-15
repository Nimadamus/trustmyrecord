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
node scripts\build_league_sim_pages.js                     >> "%LOG%" 2>&1 || goto :fail
node scripts\build_nfl_season_page.js                      >> "%LOG%" 2>&1 || goto :fail
node scripts\build_nfl_team_pages.js                       >> "%LOG%" 2>&1 || goto :fail
node tests\league-season-engine-test.js                    >> "%LOG%" 2>&1 || goto :fail
node tests\seo-indexability-regression-test.js             >> "%LOG%" 2>&1 || goto :fail

git add nfl-season-simulator nfl-simulator sitemap.xml nba-season-simulator nba-playoff-simulator nhl-season-simulator nhl-playoff-simulator nba-simulator nhl-simulator >> "%LOG%" 2>&1
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
