#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const profile = fs.readFileSync(path.join(root, 'profile', 'index.html'), 'utf8');

assert(profile.includes('let profileData = null;'), 'profileData state must remain explicit');
assert(profile.includes('let isOwnProfile = false;'), 'isOwnProfile state must remain explicit');
assert(profile.includes('profileLookupMatchesUser(requestedProfileLookup || profileUsername, currentUser)'), 'own-profile detection must compare requested profile to current user');
assert(profile.includes('window.profileData = profileData;'), 'loaded profile data must be exposed for profile modules');
assert(profile.includes('renderProfileHeader(profileData);'), 'profile header must render from loaded profile data');
/* SEO note (rewritten 2026-08-16): updateProfileSeoMeta(profileData) is gone.
   A ?user= shell now points canonical + og:url at the static, crawlable
   /u/<username>/ page from an inline head script, so indexing no longer depends
   on the profile fetch resolving. That is the property worth guarding. */
assert(profile.includes("var url='https://trustmyrecord.com/u/'+encodeURIComponent(u)+'/';"), 'profile shell must point canonical at the static /u/<username>/ record');
assert(profile.includes("var c=document.querySelector('link[rel=\"canonical\"]'); if(c) c.href=url;"), 'profile shell must rewrite the canonical link');
assert(profile.includes("var og=document.querySelector('meta[property=\"og:url\"]'); if(og) og.setAttribute('content',url);"), 'profile shell must rewrite og:url');

assert(profile.includes('id="profileAvatarUploader"'), 'own-profile avatar uploader must remain in the page');
assert(profile.includes('id="profileAvatarFile"'), 'avatar file input must remain in the page');
assert(profile.includes('accept="image/png,image/jpeg,image/webp"'), 'avatar input must remain restricted to supported image types');
assert(profile.includes('if (!isOwn()) return; // public view: nothing to do'), 'profile setup/avatar wiring must stay disabled for public views');
/* Inverted 2026-08-16 to match the May 22, 2026 decision: account-edit body
   cards were retired in favour of the top-right user menu, so #profileAvatarUploader
   ships hidden and must STAY hidden. The old assertion demanded the opposite. */
assert(profile.includes('<div id="profileAvatarUploader" class="profile-avatar-uploader" hidden style="display:none !important;">'), 'avatar uploader must ship hidden on the profile body');
assert(profile.includes('DO NOT unhide #profileAvatarUploader'), 'the do-not-unhide rule must stay documented next to the wiring');
assert(profile.includes('if (uploaderEl) uploaderEl.hidden = false;') === false, 'avatar uploader must not be unhidden on the profile body');
assert(profile.includes("document.body.classList.add('tmrx-is-own-profile')"), 'own-profile class must gate avatar edit affordance');
assert(profile.includes("avatarBox.setAttribute('aria-label', 'Change avatar')"), 'clickable avatar edit affordance must remain accessible');
assert(profile.includes("body.tmrx-is-own-profile #profileHeader .profile-avatar"), 'avatar edit overlay CSS must stay owner-scoped');

/* The profileAvatarUrlFrom() helper was inlined into renderProfileHeader; the
   header reads p.avatar_url directly now. What these assertions were protecting
   -- that a user-supplied avatar URL and display name are ESCAPED before they
   are interpolated into attributes -- is asserted directly. */
assert(profile.includes('p.avatar_url ? \'<img src="\' + escapeHtml(p.avatar_url)'), 'profile header must escape the avatar URL before interpolating it');
assert(profile.includes('alt="\' + escapeHtml(name) + \'"'), 'profile header must escape the display name in the avatar alt text');
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
