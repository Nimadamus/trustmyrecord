#!/usr/bin/env node
/* =============================================================================
   STAMP SIM RUN POLICY                                    SIM_RUN_POLICY_20261030
   -----------------------------------------------------------------------------
   Writes the shared free run / pricing copy (scripts/sim-run-policy.js) into
   every place that cannot require() it:
     * each simulator page FAQ answer listed in POLICY.PAGES, both the visible
       answer and the FAQPage JSON-LD answer, matched by question text;
     * the inline sentence between SIM_RUN_POLICY:inline markers in page prose;
     * the SIM_RUN_POLICY block inside static/js/sim-auth-gate.js.
   Pages baked by a builder get the same text from the builder on their next
   bake; stamping them here only makes today's baked copy match.

     node scripts/stamp-sim-run-policy.js           write
     node scripts/stamp-sim-run-policy.js --check   exit 1 if anything drifted
   Only the answer text changes; line endings and everything else are kept.
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./sim-run-policy.js');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* Returns { text, problems[] }. */
function stampPage(html, question, answer) {
  const problems = [];
  let out = html;
  // FAQPage JSON-LD. Builders emit compact JSON; some hand pages put a space
  // after the colons, so allow optional whitespace.
  const ldRe = new RegExp('("name"\\s*:\\s*' + reEsc(JSON.stringify(question)) +
    '\\s*,\\s*"acceptedAnswer"\\s*:\\s*\\{\\s*"@type"\\s*:\\s*"Answer"\\s*,\\s*"text"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"', 'g');
  const ldHits = (out.match(ldRe) || []).length;
  if (ldHits !== 1) problems.push('JSON-LD answer found ' + ldHits + ' times');
  out = out.replace(ldRe, (_, head) => head + JSON.stringify(answer));
  // Visible FAQ: <summary>Q</summary><p>A</p> or <h3>Q</h3>\n<p>A</p>.
  const qh = reEsc(escHtml(question));
  const visRe = new RegExp('((?:<summary>' + qh + '</summary>|<h3>' + qh + '</h3>)\\s*<p>)[\\s\\S]*?(</p>)', 'g');
  const visHits = (out.match(visRe) || []).length;
  if (visHits !== 1) problems.push('visible answer found ' + visHits + ' times');
  out = out.replace(visRe, (_, head, tail) => head + escHtml(answer) + tail);
  return { text: out, problems };
}

const INLINE_RE = /(<!--SIM_RUN_POLICY:inline-->)[\s\S]*?(<!--\/SIM_RUN_POLICY-->)/g;
function stampInline(html) {
  const hits = (html.match(INLINE_RE) || []).length;
  if (!hits) return { text: html, problems: ['inline policy markers missing'] };
  return { text: html.replace(INLINE_RE, (_, a, b) => a + escHtml(P.INLINE) + b), problems: [] };
}

const GATE = 'static/js/sim-auth-gate.js';
const BLOCK_RE = /(\/\* SIM_RUN_POLICY:BEGIN[^*]*\*\/\r?\n\s*)[^\r\n]*(\r?\n\s*\/\* SIM_RUN_POLICY:END \*\/)/;

function stampGate(src) {
  if (!BLOCK_RE.test(src)) return { text: src, problems: ['SIM_RUN_POLICY block markers missing'] };
  return { text: src.replace(BLOCK_RE, (_, a, b) => a + P.runtimeBlock() + b), problems: [] };
}

function run() {
  const drift = [];
  const broken = [];
  const jobs = P.PAGES.map(([file, q, a]) => [file, (t) => stampPage(t, q, a)])
    .concat(P.INLINE_PAGES.map((file) => [file, stampInline]))
    .concat([[GATE, stampGate]]);
  const byFile = new Map();
  for (const [file, fn] of jobs) {
    const full = path.join(ROOT, file);
    const before = byFile.has(file) ? byFile.get(file) : fs.readFileSync(full, 'utf8');
    const { text, problems } = fn(before);
    problems.forEach((p) => broken.push(file + ': ' + p));
    byFile.set(file, text);
  }
  for (const [file, text] of byFile) {
    const full = path.join(ROOT, file);
    if (fs.readFileSync(full, 'utf8') === text) continue;
    drift.push(file);
    if (!CHECK) fs.writeFileSync(full, text);
  }
  return { drift, broken };
}

if (require.main === module) {
  const { drift, broken } = run();
  broken.forEach((b) => console.error('BROKEN ' + b));
  if (CHECK) {
    drift.forEach((d) => console.error('DRIFT  ' + d));
    if (drift.length || broken.length) process.exit(1);
    console.log('sim run policy copy is in sync (' + P.PAGES.length + ' pages + runtime gate)');
  } else {
    drift.forEach((d) => console.log('stamped ' + d));
    if (broken.length) process.exit(1);
  }
}

module.exports = { stampPage, stampGate, run };
