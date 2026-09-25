'use strict';
/* CLOUD_AUDIT_20260924: GET /api/challenges/open sends creator_avatar_url and
   sport_game (routes/challenges.js). The home arena card read creator_avatar
   and sport, so every row said "Any sport" and skipped the stored avatar.
   Run: node tests/home-arena-open-challenge-fields-test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'tmr-home-live.js'), 'utf8');
const i = src.indexOf("j('/challenges/open')");
assert(i >= 0, 'open challenges block not found');
const block = src.slice(i, i + 1500);
assert(/avatar_url: x\.creator_avatar_url \|\| x\.creator_avatar/.test(block), 'must read creator_avatar_url');
assert(/esc\(x\.sport_game \|\| x\.sport \|\| 'Any sport'\)/.test(block), 'must read sport_game');
console.log('PASS home arena card reads the fields /challenges/open sends');
