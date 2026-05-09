#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const profile = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');

const marker = 'PROFILE_NO_OLD_THEME_FLASH_20260508';
const markerIndex = profile.indexOf(marker);
const legacyLightIndex = profile.indexOf('--bg-primary: #f3f5f8');
const bodyLightIndex = profile.indexOf('background: var(--bg-primary);');

assert(markerIndex !== -1, 'profile anti-flash guard marker is missing');
assert(legacyLightIndex !== -1, 'legacy compatibility profile tokens should remain explicit for review');
assert(markerIndex < legacyLightIndex, 'anti-flash profile layer must load before legacy light profile tokens');
assert(markerIndex < bodyLightIndex, 'anti-flash profile layer must load before legacy body background');

for (const required of [
  'html body.profile-page.tmr-social-profile',
  'radial-gradient(920px 520px at 86% -12%',
  '#050a14 !important',
  'html body.profile-page.tmr-social-profile .profile-header',
  'html body.profile-page.tmr-social-profile .profile-header .loading',
]) {
  assert(profile.includes(required), `profile anti-flash rule missing: ${required}`);
}

assert(profile.includes('body.profile-page tmr-social-profile') === false, 'profile body selector must not drop the class separator');
assert(profile.includes('body.profile-page.tmr-social-profile {'), 'current dark profile redesign layer must remain in place');
assert(profile.includes('renderProfileHeader(profileData);'), 'profile render flow must remain intact');

console.log('profile no-old-theme-flash regression test passed');
