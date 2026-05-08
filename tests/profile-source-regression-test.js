#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const profile = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');

assert(profile.includes('let profileData = null;'), 'profileData state must remain explicit');
assert(profile.includes('let isOwnProfile = false;'), 'isOwnProfile state must remain explicit');
assert(profile.includes('profileLookupMatchesUser(profileUsername, currentUser)'), 'own-profile detection must compare requested profile to current user');
assert(profile.includes('window.profileData = profileData;'), 'loaded profile data must be exposed for profile modules');
assert(profile.includes('renderProfileHeader(profileData);'), 'profile header must render from loaded profile data');
assert(profile.includes('updateProfileSeoMeta(profileData);'), 'profile SEO metadata must update from loaded profile data');

assert(profile.includes('id="profileAvatarUploader"'), 'own-profile avatar uploader must remain in the page');
assert(profile.includes('id="profileAvatarFile"'), 'avatar file input must remain in the page');
assert(profile.includes('accept="image/png,image/jpeg,image/webp"'), 'avatar input must remain restricted to supported image types');
assert(profile.includes('if (!isOwn()) return; // public view: nothing to do'), 'profile setup/avatar wiring must stay disabled for public views');
assert(profile.includes('if (uploaderEl) uploaderEl.hidden = false;'), 'avatar uploader should only unhide after owner setup wiring');
assert(profile.includes("document.body.classList.add('tmrx-is-own-profile')"), 'own-profile class must gate avatar edit affordance');
assert(profile.includes("avatarBox.setAttribute('aria-label', 'Change avatar')"), 'clickable avatar edit affordance must remain accessible');
assert(profile.includes("body.tmrx-is-own-profile #profileHeader .profile-avatar"), 'avatar edit overlay CSS must stay owner-scoped');

assert(profile.includes('function profileAvatarUrlFrom(user)') && profile.includes('user.avatar_url || user.avatarUrl || user.avatar || user.profile_image_url || user.profileImageUrl'), 'profile avatar helper must read supported avatar fields');
assert(profile.includes('const avatarUrl = profileAvatarUrlFrom(p);'), 'profile header must read avatars through the shared avatar helper');
assert(profile.includes('avatarUrl ? \'<img src="\' + escTxt(avatarUrl)'), 'profile header must render loaded avatar image when available');
assert(profile.includes('loading="eager"'), 'profile avatar should load eagerly in the header');
assert(profile.includes('decoding="async"'), 'profile avatar should use async decoding');

assert(profile.includes("await window.api.request('/users/profile', { method: 'PUT', body: { avatar_url: dataUri } });"), 'avatar upload must save through the profile API');
assert(profile.includes('window.profileData.avatar_url = dataUri;'), 'avatar upload must update profileData immediately');
assert(profile.includes('window.api._cachedUser.avatar_url = dataUri;'), 'avatar upload must refresh cached API user avatar_url');
assert(profile.includes('window.api._cachedUser.avatarUrl = dataUri;'), 'avatar upload must refresh cached API user avatarUrl');
assert(profile.includes('window.auth.currentUser.avatar_url = dataUri;'), 'avatar upload must refresh auth currentUser avatar_url');
assert(profile.includes('window.auth.currentUser.avatarUrl = dataUri;'), 'avatar upload must refresh auth currentUser avatarUrl');
assert(profile.includes("['trustmyrecord_session','tmr_current_user','currentUser']"), 'avatar upload must refresh local user cache keys');

assert(profile.includes('if (!profileData || typeof profileData !== \'object\')'), 'edit modal must guard against unloaded profile data');
assert(profile.includes('Profile is still loading. Try again in a moment.'), 'edit modal must tell users when profile is still loading');

console.log('profile source regression test passed');
