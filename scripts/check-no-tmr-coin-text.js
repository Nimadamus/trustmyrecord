#!/usr/bin/env node
// Regression guard for the TMR Coin -> TMR Competition Credits rebrand.
// Fails if the literal phrase "TMR Coin" appears in any tracked .html/.js file
// outside the allow-listed internal identifiers below (table/column names,
// route paths, JS API method names, dev-only comments) that intentionally
// were not renamed this phase.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const ALLOWED_LINE_PATTERNS = [
  /tmr_coin_wallets/,
  /tmr_coin_ledger/,
  /\/api\/coins/,
  /getCoinBalance/,
  /getCoinTransactions/,
  /getCoinCatalog/,
  /navCoinPill/,
  /navCoinChip/,
  /navCoinBalance/,
  /data-tmr-coin-balance/,
  /fa-coins/,
  /coinResult|coinData|coinSection|coinCell/,
  /^\s*\/\//, // dev-only comment lines are allowed to still reference the old name
  /how-tmr-coin-works/, // URL slug intentionally kept unchanged this phase
  /\?v=.*coins/, // cache-busting query strings on asset URLs, not display text
];

function listTrackedFiles() {
  const out = execSync('git ls-files "*.html" "*.js"', { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter(Boolean).filter((f) => !f.startsWith("node_modules/"));
}

function main() {
  const files = listTrackedFiles();
  const violations = [];

  for (const rel of files) {
    const full = path.join(ROOT, rel);
    let content;
    try {
      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (!/TMR Coin/i.test(line)) return;
      if (ALLOWED_LINE_PATTERNS.some((re) => re.test(line))) return;
      violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
    });
  }

  if (violations.length) {
    console.error(`Found ${violations.length} user-facing "TMR Coin" occurrence(s):\n`);
    violations.forEach((v) => console.error("  " + v));
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${files.length} tracked .html/.js files -- 0 user-facing "TMR Coin" occurrences.`);
}

main();
