#!/usr/bin/env node

/**
 * /profile/ must never paint the legacy light theme before the dark redesign
 * lands. The original guard (May 8, 2026) locked a `PROFILE_NO_OLD_THEME_FLASH`
 * override block that was declared BEFORE the legacy light tokens and beat them
 * with `!important`.
 *
 * Rewritten 2026-08-16. The page no longer carries that marker block: the dark
 * redesign layer (`body.profile-page.tmr-social-profile`) now sits AFTER the
 * legacy tokens, so it wins on cascade order rather than by pre-empting them.
 * The property being protected is unchanged and is what this file asserts:
 *
 *   1. the dark layer is inline in the profile HTML (not an external asset that
 *      a stale CDN copy could withhold),
 *   2. it is fully parsed before <body>, so the first paint is already dark,
 *   3. it resolves ahead of the legacy light tokens in the cascade, and
 *   4. <body> carries both classes the layer is scoped to, at first paint.
 *
 * The old assertions were kept as long as they described the page. They were
 * replaced, not deleted, once they described a mechanism that no longer exists.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const profile = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');

const darkLayerIndex = profile.indexOf('body.profile-page.tmr-social-profile {');
const legacyLightIndex = profile.indexOf('--bg-primary: #f3f5f8');
const bodyLightIndex = profile.indexOf('background: var(--bg-primary);');
const bodyIndex = profile.indexOf('<body');
const bodyClassIndex = profile.indexOf('<body class="profile-page tmr-social-profile">');
const headEndIndex = profile.indexOf('</head>');

assert(darkLayerIndex !== -1, 'dark profile redesign layer is missing');
assert(bodyIndex !== -1, 'profile body tag is missing');
assert(bodyClassIndex !== -1, 'profile body must carry profile-page and tmr-social-profile classes at first paint');

// (1) + (2): inline, and closed before the body is parsed.
assert(darkLayerIndex < headEndIndex, 'dark profile layer must be inline in <head>, not deferred to an external asset');
assert(darkLayerIndex < bodyIndex, 'dark profile layer must be declared before the body is parsed');

// (3): the legacy light tokens still ship for review, but the dark layer must
// resolve after them so the cascade lands on dark.
assert(legacyLightIndex !== -1, 'legacy compatibility profile tokens should remain explicit for review');
assert(legacyLightIndex < darkLayerIndex, 'dark profile layer must be declared AFTER the legacy light tokens so it wins the cascade');
assert(bodyLightIndex < darkLayerIndex, 'dark profile layer must be declared AFTER the legacy body background so it wins the cascade');
assert(
  profile.slice(darkLayerIndex, darkLayerIndex + 400).includes('#050a14 !important'),
  'dark profile layer must paint the dark background with !important'
);

// (4): every surface the layer is responsible for is still scoped to it.
for (const required of [
  'body.profile-page.tmr-social-profile .profile-header',
  'body.profile-page.tmr-social-profile .profile-avatar',
  'body.profile-page.tmr-social-profile .profile-body-grid',
  'body.profile-page.tmr-social-profile .profile-rail',
  'body.profile-page.tmr-social-profile .tmrx-stats',
  'body.profile-page.tmr-social-profile .tmrx-ribbon',
]) {
  assert(profile.includes(required), `profile dark-layer rule missing: ${required}`);
}

assert(profile.includes('body.profile-page tmr-social-profile') === false, 'profile body selector must not drop the class separator');
assert(profile.includes('<body class="profile-page">') === false, 'profile body must not lose the dark redesign class');
assert(profile.includes('renderProfileHeader(profileData);'), 'profile render flow must remain intact');

console.log('profile no-old-theme-flash regression test passed');
