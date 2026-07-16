#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'forum', 'index.html'), 'utf8');

for (const required of [
  'FORUM_PREMIUM_SOCIAL_UI_20260508',
  'id="tmr-forum-premium-social-ui-20260508"',
  '<link rel="canonical" href="https://trustmyrecord.com/forum/">',
  'tmr-sitewide.css?v=',
  // 50c3243d dropped the dark redesign layer for the light Two Plus Two classic
  // skin, so the body no longer carries tmr-forum-live-redesign. Lock the skin
  // that replaced it, by its own marker.
  'class="classic-forum"',
  'TWO_PLUS_TWO_FORUM_STYLE_TARGET_20260531',
  'id="categoriesContainer"',
  'id="threadsBody"',
  'id="postsContainer"',
  'id="newThreadModal"',
  'id="newThreadForm"',
  'function loadCategories()',
  'async function loadThreads()',
  'async function showThreadsList',
  'async function showThreadDetail',
  'function openNewThread()',
  'function closeNewThread()',
  'async function submitThread',
  'async function submitReply',
  "api.request('/forum/threads'",
  "api.request('/forum/threads/' + currentThreadId + '/posts'",
  "api.request('/forum/search?q='",
]) {
  assert(html.includes(required), `forum page missing protected token: ${required}`);
}

for (const cssToken of [
  '--forum-bg:#050a14',
  'linear-gradient(135deg,var(--forum-accent),#67e8d6)',
  'body.tmr-forum-live-redesign .fgroup-table td.fcell',
  'body.tmr-forum-live-redesign .fthread-post',
  'body.tmr-forum-live-redesign .modal-overlay',
  '@media (max-width:820px)',
  '@media (max-width:520px)',
]) {
  assert(html.includes(cssToken), `forum premium visual CSS missing: ${cssToken}`);
}

const finalLayer = html.indexOf('FORUM_PREMIUM_SOCIAL_UI_20260508');
const liveLayer = html.indexOf('tmr-live-forum-redesign-20260504');
assert(liveLayer !== -1 && finalLayer > liveLayer, 'premium forum layer must load after older forum redesign layer');

assert(!html.includes('sampleThreads = ['), 'forum page must not reintroduce hard-coded fake sample threads');
// 9f32dc69 reworded the empty state and added the log-in CTA. Both variants
// (logged in / logged out) must stay helpful rather than render blank.
assert(html.includes('No threads here yet. Be the first to start the discussion.'), 'forum empty thread copy must remain');
assert(html.includes('No threads here yet. Be the first to start this discussion. Log in to post.'), 'forum logged-out empty thread CTA must remain');

console.log('forum page visual regression test passed');
