@echo off
REM Daily MLB matchup page bake. Stand-in for .github/workflows/mlb-matchup-pages.yml,
REM which cannot be pushed until the GitHub token gains `workflow` scope.
REM Same order as the workflow: rebase, bake, cross-links, BOTH gates, then commit.
REM Fail closed: any non-zero exit stops before the commit and leaves the last good bake live.
setlocal
cd /d C:\Users\BL\tmrfe3-mlb-hub || exit /b 1
set LOG=C:\Users\BL\tmrfe3-mlb-hub\_mlb_bake.log
echo ---- %DATE% %TIME% >> "%LOG%"

git fetch origin -q                                     || goto :fail
git rebase origin/main                 >> "%LOG%" 2>&1  || goto :fail
python scripts\build_mlb_matchup_pages.py >> "%LOG%" 2>&1 || goto :fail
python scripts\add_mlb_hub_crosslinks.py  >> "%LOG%" 2>&1 || goto :fail
node tests\mlb-matchup-pages-contract-test.js   >> "%LOG%" 2>&1 || goto :fail
node tests\seo-indexability-regression-test.js  >> "%LOG%" 2>&1 || goto :fail

git add -A ":!.github/workflows/mlb-matchup-pages.yml"  >> "%LOG%" 2>&1
git diff --cached --quiet && (echo no change >> "%LOG%" & goto :done)
git commit -q -m "chore(mlb): bake matchup pages + crawlable slate" >> "%LOG%" 2>&1 || goto :fail
git push -q origin HEAD:main                            >> "%LOG%" 2>&1 || goto :fail
echo pushed >> "%LOG%"
:done
echo OK >> "%LOG%"
exit /b 0
:fail
echo FAILED, nothing published >> "%LOG%"
exit /b 1
