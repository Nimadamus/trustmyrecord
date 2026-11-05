#!/usr/bin/env node
// GATE_COPY_BOTH_HEADLINES_20261105: the live proof must accept every headline the gate can
// show. It read only one, so a copy change on 11/01 turned the workflow red for a false reason
// and nothing after that check ran. Fails on the old regex.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const proof = fs.readFileSync(path.join(root, 'scripts', 'tools-live-browser-proof.js'), 'utf8');
const gate = fs.readFileSync(path.join(root, 'static', 'js', 'sim-auth-gate.js'), 'utf8');

const block = gate.match(/var headline = \(cfg && cfg\.gateHeadline\) \|\| \(anonFreeRunAvailable\(\)\s*\? '([^']+)'\s*: '([^']+)'\)/);
assert.ok(block, 'gate headlines not found in sim-auth-gate.js');

const m = proof.match(/const GATE_FREE_ACCOUNT_COPY = (\/.+\/i);/);
assert.ok(m, 'proof must define GATE_FREE_ACCOUNT_COPY');
const re = new Function('return ' + m[1])();
for (const headline of [block[1], block[2]]) assert.ok(re.test(headline), 'proof rejects gate headline: ' + headline);
assert.ok(!/\/free TrustMyRecord account\/i\.test\(gateText\)/.test(proof), 'old single headline check is gone');

console.log('mlb-live-proof-gate-copy-test ok');
