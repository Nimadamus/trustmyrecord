'use strict';
/* CLOUD_AUDIT_20260924: /api/users/:u/metrics sends summary.pending_picks to
   the owner only. The profile wrote String(s.pending_picks || 0), so every
   visitor saw "Pending 0" over whatever the page had. It must leave the tile
   alone when the field is absent.  Run: node tests/profile-pending-tile-visitor-test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'profile', 'index.html'), 'utf8');
assert(!/String\(s\.pending_picks \|\| 0\)/.test(html), 'pending tile must not default a missing owner-only field to 0');
assert(/if \(s\.pending_picks != null\) set\('advPending', String\(s\.pending_picks\)\);/.test(html));
assert(/if \(s\.pending_picks != null\) setVal\('tmrxPending', String\(s\.pending_picks\)\);/.test(html));
console.log('PASS profile pending tile is not forced to 0 for visitors');
