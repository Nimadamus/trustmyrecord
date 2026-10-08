@echo off
REM BAKE_RUNNER_20261007: the bake steps, lock, heartbeat, timeout and state live in
REM scripts\run_league_sim_bake.py. This wrapper only starts it, so the file the
REM shell is reading never changes length under it when the run resets the tree.
cd /d C:\Users\BL\tmrfe-league-sim || exit /b 1
"C:\Users\BL\AppData\Local\Programs\Python\Python310\python.exe" scripts\run_league_sim_bake.py
exit /b %ERRORLEVEL%
