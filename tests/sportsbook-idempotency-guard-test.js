#!/usr/bin/env node
/**
 * PICK_IDEMPOTENCY_20260903 static guard.
 *
 * Every Lock Pick POST must carry a submission identity so a double-click,
 * retry, browser-lag retry or repeated POST of the SAME staged wager replays
 * to the original pick (backend `pick_submission_requests`) instead of
 * recording a second wager. On 2026-09-03 two byte-identical picks (5709 and
 * 5710) were both accepted 2m34s apart because no client had ever sent a key.
 *
 * This test fails if that wiring is edited away. It does NOT check styling.
 * Behavioural proof lives in tests/sportsbook-v2/idempotency-ui.cjs (client
 * key lifecycle, POST intercepted) and tests/sportsbook-v2/idempotency-api.cjs
 * (backend replay/409/new-wager contract).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reliability = fs.readFileSync(
  path.join(root, 'static', 'js', 'sportsbook-production-fix-persist-reliability.js'),
  'utf8'
);
const multislip = fs.readFileSync(
  path.join(root, 'static', 'js', 'sportsbook-multislip.js'),
  'utf8'
);

const FAILURE =
  'PICK_IDEMPOTENCY_20260903 wiring changed. Every Lock must send submission_batch_id + submission_item_key.\n' +
  'Removing it lets a retry or double-click record a second real wager. Do not delete without explicit approval.';

function must(condition, detail) {
  assert.ok(condition, `${FAILURE}\n${detail}`);
}

// ---- single-pick bridge ----------------------------------------------------
must(
  /PICK_IDEMPOTENCY_20260903/.test(reliability),
  'reliability script lost its PICK_IDEMPOTENCY_20260903 marker'
);
must(
  /function buildSubmissionIdentity\s*\(/.test(reliability),
  'buildSubmissionIdentity() is missing from the reliability script'
);
must(
  /submission_batch_id:\s*state\.submissionSeed/.test(reliability),
  'submission_batch_id is no longer built from the staging seed'
);
must(
  /submission_item_key:/.test(reliability),
  'submission_item_key is no longer sent'
);
must(
  /Object\.assign\(payload,\s*buildSubmissionIdentity\(payload\)\)/.test(reliability),
  'the Lock payload no longer merges the submission identity'
);
must(
  /state\.submissionSeed\s*=\s*newSubmissionSeed\(\)/.test(reliability),
  'a fresh seed is no longer minted when a price is staged (a re-tap must be a NEW wager)'
);

// The key must fold in every material wager input, so changing any of them is a
// new wager and repeating an unchanged one is a replay.
const identityBlock = reliability.slice(
  reliability.indexOf('function buildSubmissionIdentity'),
  reliability.indexOf('function buildSubmissionIdentity') + 900
);
for (const field of [
  'game_id',
  'market_type',
  'selection',
  'line_snapshot',
  'odds_snapshot',
  'units',
  'stake_mode',
]) {
  must(
    identityBlock.includes(field),
    `the submission key no longer folds in payload.${field}; a change to it would replay as the same wager`
  );
}

// ---- multi-pick slip -------------------------------------------------------
must(
  /PICK_IDEMPOTENCY_20260903/.test(multislip),
  'multislip lost its PICK_IDEMPOTENCY_20260903 marker'
);
must(
  /payload\.submission_batch_id\s*=/.test(multislip) &&
    /payload\.submission_item_key\s*=/.test(multislip),
  'multislip entries no longer carry a submission identity'
);
must(
  /entry\.__tmrSeed/.test(multislip),
  'multislip no longer mints a per-entry seed (a removed and re-added line must be a NEW wager)'
);

// ---- the in-flight guard that stops the cheapest double-click --------------
must(
  /__tmrLockInFlight/.test(reliability),
  'the lock in-flight re-entry guard was removed'
);

console.log('PASS sportsbook idempotency guard (submission identity wired on both submit paths)');
