#!/usr/bin/env node
/*
 * EVERY INLINE SCRIPT ON EVERY PAGE MUST PARSE.
 *
 * 2026-09-09: sportsbook/index.html carried
 *     hint:'A player's own total'
 * an unescaped apostrophe inside a single-quoted string. That is a syntax error,
 * and a syntax error kills the WHOLE script block - in this case 196KB of the
 * sportsbook, including window.showPickStep, so the picks module never
 * initialised and the page threw "showPickStep is not a function" on every load.
 *
 * It survived because the checks that could have caught it did not look here:
 * node --check reads .js files, and the ad-hoc regex sweeps people (me included)
 * write for inline blocks are easy to get subtly wrong. This one extracts blocks
 * the way a browser delimits them and parses each with the real JS parser.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'artifacts', 'test-results',
  'playwright-report', '.playwright-mcp', '_qa_baseline']);
/* Only the JS types a browser executes. JSON-LD and templates are not scripts. */
const RUNNABLE = /^(?:\s*|\s*type\s*=\s*["'](?:text\/javascript|application\/javascript|module)["']\s*)$/i;

let files = 0;
let blocks = 0;
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    /* A content-hashed build is a copy of a source checked elsewhere. */
    if (/\.[0-9a-f]{12}\.html$/.test(entry.name)) continue;
    check(path.join(dir, entry.name));
  }
}

function check(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  let index = 0;
  files += 1;
  while ((m = re.exec(html))) {
    index += 1;
    const attrs = m[1] || '';
    const body = m[2] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (!RUNNABLE.test(attrs)) continue;
    if (!body.trim()) continue;
    blocks += 1;
    try {
      new vm.Script(body, { filename: rel + '#' + index });
    } catch (error) {
      const line = Number((String(error.stack).match(/#\d+:(\d+)/) || [])[1] || 0);
      const source = line ? (body.split('\n')[line - 1] || '').trim().slice(0, 140) : '';
      failures.push(`${rel} block ${index}: ${error.message}${line ? `\n    line ${line}: ${source}` : ''}`);
    }
  }
}

walk(ROOT);

if (failures.length) {
  console.error(`inline script parse test FAILED (${failures.length}):`);
  failures.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log(`inline script parse test: ${blocks} inline block(s) across ${files} page(s) all parse`);
