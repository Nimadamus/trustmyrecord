#!/usr/bin/env node
/* SIM_PAGE_FRESHNESS_ALERT_20261113. Decides what the scheduled stale-page monitor should do
 * with its one alert issue, so a problem that lasts 40 hours produces one notice, not forty.
 *
 *   open     no open alert and at least one page is stale
 *   comment  an alert is open and the SET of stale pages changed (a page joined or recovered)
 *   none     an alert is open for exactly these pages already, or everything is fresh
 *   close    an alert is open and every page is fresh again
 *
 * The set of stale pages is kept in the issue body as a fingerprint line. Ages are left out
 * of the fingerprint on purpose: "40.1 h" becoming "41.1 h" is not news.
 *
 * Usage (the workflow): node scripts/sim-page-freshness-alert.js <check.json> <open-issue-body.txt or ->
 * Prints one JSON line: { action, title, body, comment, fingerprint }. Writes nothing. */
'use strict';
const FP_RE = /<!-- sim-page-freshness:([a-z0-9,-]*) -->/;

function fingerprint(problems) {
  return [...new Set((problems || []).map((p) => p.page))].sort().join(',');
}

function decide(check, openBody) {
  const problems = (check && check.problems) || [];
  const when = (check && check.checked_at) || '';
  const fp = fingerprint(problems);
  const hasOpen = typeof openBody === 'string' && openBody.length > 0;
  const prev = hasOpen ? ((openBody.match(FP_RE) || [])[1]) : undefined;
  const list = problems.map((p) => `- /${p.page}/: ${p.problem}`).join('\n');
  const body = `Simulator pages on trustmyrecord.com are behind (checked ${when}).\n\n${list}\n\n`
    + 'The hourly League Simulator Bake publishes nothing when one of its gates fails. Open the latest run of that workflow first.\n\n'
    + `<!-- sim-page-freshness:${fp} -->`;
  if (!problems.length) {
    return hasOpen
      ? { action: 'close', comment: `All simulator pages are fresh again (checked ${when}).`, fingerprint: '' }
      : { action: 'none', fingerprint: '' };
  }
  if (!hasOpen) return { action: 'open', title: `Simulator pages are stale (${problems.length} page${problems.length === 1 ? '' : 's'})`, body, fingerprint: fp };
  if (prev === fp) return { action: 'none', fingerprint: fp };
  const was = new Set(String(prev || '').split(',').filter(Boolean)); const now = new Set(fp.split(','));
  const joined = [...now].filter((x) => !was.has(x)); const left = [...was].filter((x) => !now.has(x));
  const comment = `Changed at ${when}.`
    + (joined.length ? ` Now also stale: ${joined.map((x) => '/' + x + '/').join(', ')}.` : '')
    + (left.length ? ` Fresh again: ${left.map((x) => '/' + x + '/').join(', ')}.` : '')
    + `\n\n${list}`;
  return { action: 'comment', comment, body, fingerprint: fp };
}

module.exports = { decide, fingerprint, FP_RE };

if (require.main === module) {
  const fs = require('fs');
  let check;
  try { check = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); } catch (e) {
    /* the checker itself did not answer: treat as one problem so it is not silent */
    check = { checked_at: new Date().toISOString(), problems: [{ page: 'checker', problem: 'the freshness check did not produce a result' }] };
  }
  const f = process.argv[3];
  const openBody = f && f !== '-' && fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
  console.log(JSON.stringify(decide(check, openBody)));
}
