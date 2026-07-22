#!/usr/bin/env node
/*
 * AUTOMATED DAILY MLB ROSTER + LINEUP SYNC (LINEUP_INTEGRITY_20260722).
 *
 * Runs the live production simulator engine against every MLB club, verifies
 * each lineup, and diffs against the previous run to surface same-day roster
 * transactions and lineup churn. Writes a dated report plus `latest.json`, and
 * on any failure writes ALERT.txt (and exits non-zero) so the scheduler surfaces it.
 *
 * IMPORTANT / HONEST SCOPE: the simulator is a CLIENT-SIDE page — every visitor
 * fetches rosters and lineups straight from statsapi.mlb.com at run time with a
 * 2-5 minute TTL. This job therefore does NOT "push" fresh rosters to users;
 * nothing is cached server-side to go stale. Its job is VERIFICATION and
 * ALERTING: prove all 30 clubs still resolve to a legal, current lineup through
 * the deployed code, and catch a feed/shape regression the day it appears.
 *
 * Usage: node scripts/daily-roster-sync.cjs [--engine <url|path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');
const argv = process.argv.slice(2);
function arg(name, dflt) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; }
const ENGINE = arg('--engine', 'https://trustmyrecord.com/static/js/mlb-simulator.js');

if (!fs.existsSync(REPORTS)) fs.mkdirSync(REPORTS, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const day = new Date().toISOString().slice(0, 10);
const outFile = path.join(REPORTS, 'sync-' + stamp + '.json');
const latestFile = path.join(REPORTS, 'latest.json');
const alertFile = path.join(ROOT, 'ALERT.txt');
const logFile = path.join(REPORTS, 'sync-' + day + '.log');

function log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

let exitCode = 0, syncOut = '';
try {
  syncOut = execFileSync(process.execPath,
    [path.join(__dirname, 'lineup-sync.cjs'), '--engine', ENGINE, '--out', outFile],
    { encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 });
} catch (e) {
  exitCode = 1;
  syncOut = (e.stdout || '') + (e.stderr || '');
}
fs.appendFileSync(logFile, syncOut.split('\n').filter(l => !/EMERGENCY FALLBACK/.test(l)).join('\n') + '\n');

if (!fs.existsSync(outFile)) {
  fs.writeFileSync(alertFile, 'MLB roster sync produced NO report at ' + new Date().toISOString() + '\n' + syncOut.slice(-4000));
  log('FATAL: no report produced');
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
const teams = report.teams || {};
const abbrs = Object.keys(teams);

// --- diff vs previous run: roster churn + same-day transactions ---------------
let prev = null;
if (fs.existsSync(latestFile)) { try { prev = JSON.parse(fs.readFileSync(latestFile, 'utf8')); } catch (e) { prev = null; } }
const changes = [];
abbrs.forEach(ab => {
  const cur = teams[ab];
  (cur.todayTransactions || []).forEach(t => {
    changes.push(ab + ' TRANSACTION: ' + (t.type || '?') + ' - ' + (t.player || '?') + (t.description ? ' (' + t.description.slice(0, 120) + ')' : ''));
  });
  const p = prev && prev.teams && prev.teams[ab];
  if (!p || !p.lineup || !cur.lineup) return;
  const before = p.lineup.map(x => x.name), after = cur.lineup.map(x => x.name);
  const gone = before.filter(n => after.indexOf(n) === -1);
  const added = after.filter(n => before.indexOf(n) === -1);
  if (gone.length || added.length) {
    changes.push(ab + ' LINEUP CHANGE: out [' + gone.join(', ') + '] in [' + added.join(', ') + ']' +
      (p.lineupStatus !== cur.lineupStatus ? ' (' + p.lineupStatus + ' -> ' + cur.lineupStatus + ')' : ''));
  }
});

const s = report.summary || {};
log('build=' + report.build + ' fix=' + report.lineupIntegrityFix);
log('teams synced ' + s.teamsSynced + '/' + s.teamsAttempted + ', lineups valid ' + s.teamsValid + '/' + s.teamsAttempted);
log('substitutes excluded=' + s.substitutesRejected + ' removed=' + s.playersRemoved + ' backfilled=' + s.playersBackfilled + ' transactions=' + s.sameDayTransactions);
changes.forEach(c => log('  ' + c));

const problems = [];
if (!report.lineupIntegrityFix) problems.push('deployed engine is MISSING the lineup-integrity fix');
if (s.teamsSynced !== 30) problems.push('only ' + s.teamsSynced + '/30 teams synced');
if (s.teamsValid !== s.teamsAttempted) {
  abbrs.filter(k => !teams[k].ok).forEach(k => problems.push(k + ': ' + (teams[k].error || (teams[k].problems || []).join('; '))));
}

fs.writeFileSync(latestFile, JSON.stringify(report, null, 1));
fs.writeFileSync(path.join(REPORTS, 'changes-' + day + '.txt'), changes.join('\n') + '\n');

if (problems.length) {
  const msg = 'MLB SIMULATOR ROSTER SYNC FAILED ' + new Date().toISOString() + '\n' + problems.map(p => ' - ' + p).join('\n') + '\n\nreport: ' + outFile + '\n';
  fs.writeFileSync(alertFile, msg);
  log('RESULT: FAIL\n' + msg);
  process.exit(1);
}
if (fs.existsSync(alertFile)) fs.unlinkSync(alertFile);
log('RESULT: PASS (' + changes.length + ' change(s) noted)');
process.exit(0);
