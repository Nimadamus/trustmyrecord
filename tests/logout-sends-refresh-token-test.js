'use strict';
/* CLOUD_AUDIT_20260924: POST /api/auth/logout deletes ALL of a member's
   sessions when no refreshToken is in the body (routes/auth.js). logout()
   sent no body, so logging out on one device signed out every device.
   Run: node tests/logout-sends-refresh-token-test.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'backend-api.js'), 'utf8');
const start = src.indexOf('async logout()');
assert(start >= 0, 'logout() not found');
let depth = 0; let i = src.indexOf('{', start);
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (!depth) break; } }
const body = src.slice(src.indexOf('{', start) + 1, i);

(async () => {
  const fn = vm.runInNewContext('(async function logout(){' + body + '})');
  const seen = [];
  let cleared = false;
  const api = {
    refreshToken: 'rt-device-A',
    request: async (endpoint, opts) => { seen.push({ endpoint, opts }); return {}; },
    clearTokens: () => { cleared = true; },
  };
  await fn.call(api);
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].endpoint, '/auth/logout');
  assert.strictEqual(seen[0].opts.method, 'POST');
  assert.strictEqual(JSON.stringify(seen[0].opts.body), JSON.stringify({ refreshToken: 'rt-device-A' }), 'logout must send this device refresh token');
  assert(cleared, 'tokens still cleared');
  console.log('PASS logout sends only this device refresh token');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
