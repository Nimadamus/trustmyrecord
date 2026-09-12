#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const shellHtml = fs.readFileSync(path.join(root, 'forum', 'index.html'), 'utf8');

// PERF_SHELL_SPLIT_20260911: the forum shell used to carry ~170KB of <style> and
// ~151KB of <script> inline, which meant every /forum/ view re-downloaded them
// uncached and every /forum/thread/<id>/<slug>/ view re-parsed them a second time
// through document.write(). They now live in two cacheable files. NOTHING was
// deleted or rewritten -- the bytes moved -- so this lock still has to see every
// protected token. It therefore checks the shell PLUS its two extracted assets as
// one logical unit, in document order, which is exactly the text the browser ends
// up with. Weakening or removing a token here is still a regression.
const shellCss = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-forum-app.css'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'static', 'js', 'tmr-forum-app.js'), 'utf8');
const html = [shellHtml, shellCss, shellJs].join(String.fromCharCode(10));

// The split must stay wired up, or the page silently loses its styling and all of
// its behaviour while every token check below still passes against the files.
assert(shellHtml.includes('/static/css/tmr-forum-app.css?v='), 'forum shell must link the extracted stylesheet');
assert(shellHtml.includes('/static/js/tmr-forum-app.js?v='), 'forum shell must load the extracted app script');

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
