/**
 * FEED_SOCIAL_20261114 -- the feed's social layer (static/js/feed-social.js):
 * mention links, quoted post embed, Disagree button and Ride / Fade slot are
 * added to the card markup without rebuilding it, and nothing unsafe gets in.
 *
 * No network, no jsdom.
 *
 *   node tests/feed-social-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'static', 'js', 'feed-social.js'), 'utf8');

function boot(opts) {
  const o = opts || {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sandbox = {
    console, Promise, setTimeout, clearTimeout, Map, Set, RegExp, Array, Number, String, Date, encodeURIComponent,
    esc,
    jsArg: (v) => "'" + String(v).replace(/'/g, '') + "'",
    getUsername: (i) => i.username,
    getDisplayName: (i) => i.display_name || i.username,
    fvPhotoUrl: (i) => (/^https:\/\/api\.trustmyrecord\.com\/api\/forum\/images\//.test(String(i.image_url || '')) ? i.image_url : ''),
    auth: { currentUser: o.user || null },
    api: { request: async () => ({}) },
    document: {
      readyState: 'complete',
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => ({ setAttribute() {}, addEventListener() {} }),
    },
    renderTextPost: (i) => '<div class="feed-item" data-id="' + esc(i.item_id) + '" data-type="feed_post"><div class="fv-post-main">' +
      '<div class="fi-content"><span>' + esc(i.content || '') + '</span></div>' +
      '<div class="fi-actions"><button type="button" class="fi-action fv-like " onclick="likeFeedPost(\'' + i.item_id + '\', this)">Like <span>0</span></button>' +
      '<button type="button" class="fi-action" onclick="toggleComments(\'' + i.item_id + '\', \'feed_post\')">Comment <span>0</span></button></div></div></div>',
    renderPickCard: (i) => '<div class="feed-item" data-id="g" data-type="pick"><div class="fv-pick-grid"></div><div class="fi-actions"><button>Share</button></div></div>',
    fvOpenMore() {},
    submitPost: async () => 'base-submit',
    likeFeedPost() {},
    loadSidebarStats: async () => {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

(async () => {
  await t('only real members become mention links, emails and longer names do not', () => {
    const s = boot();
    const out = s.TMRFeedSocial._linkMentions('hi @Ken_B, a@Ken_B.com @ken_bx and @KEN_B!', ['Ken_B']);
    assert.strictEqual((out.match(/class="fs-mention"/g) || []).length, 2);
    assert.ok(out.includes('a@Ken_B.com'));
    assert.ok(out.includes(' @ken_bx '));
    assert.ok(out.includes('href="/profile/?user=Ken_B">@KEN_B</a>'));
    assert.strictEqual(s.TMRFeedSocial._linkMentions('@x', ['<script>']), '@x');
  });

  await t('a quoted post is an escaped link to that post; a removed one says so', () => {
    const s = boot();
    const html = s.TMRFeedSocial._quoteHtml({ id: 10, username: 'ken', display_name: 'Ken', content: '<img src=x onerror=1>', image_url: 'https://evil.example/x.png' });
    assert.ok(html.includes('href="/feed/?post=10"'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('evil.example'), 'an image off this site must be dropped');
    assert.ok(s.TMRFeedSocial._quoteHtml({ deleted: true }).includes('no longer available'));
    assert.strictEqual(s.TMRFeedSocial._quoteHtml({ id: '1" onclick="x' }), '');
    assert.strictEqual(s.TMRFeedSocial._quoteHtml(null), '');
  });

  await t('a post card gains Disagree, the quote and mention links; the rest is untouched', () => {
    const s = boot();
    const html = s.renderTextPost({ item_id: '55', content: 'nice one @sam <b>', mentions: ['sam'], disagrees_count: 3, disagreed_by_user: true, quoted: { id: 9, username: 'k', content: 'orig' } });
    assert.ok(html.includes('class="fi-action fs-disagree is-on"'));
    assert.ok(html.includes('Disagree <span>3</span>'));
    assert.ok(html.indexOf('fs-disagree') < html.indexOf('toggleComments('), 'Disagree sits before Comment');
    assert.ok(html.indexOf('fv-like') < html.indexOf('fs-disagree'), 'and after Like');
    assert.ok(html.indexOf('class="fs-quote"') < html.indexOf('<div class="fi-actions">'), 'the quote sits above the actions');
    assert.ok(html.includes('<a class="fs-mention" href="/profile/?user=sam">@sam</a> &lt;b&gt;'));
    assert.strictEqual((html.match(/<div class="fi-actions">/g) || []).length, 1);
  });

  await t('a card whose id is not a real post id gets no Disagree button', () => {
    const s = boot();
    assert.ok(!s.renderTextPost({ item_id: 'notif_7', content: 'x' }).includes('fs-disagree'));
  });

  await t('a record card gets a Ride / Fade slot, except on your own record', () => {
    const mine = boot({ user: { username: 'Ken' } });
    assert.ok(!mine.renderPickCard({ username: 'ken' }).includes('fs-stance'));
    const other = boot({ user: { username: 'Sam' } });
    const html = other.renderPickCard({ username: 'ken"x' });
    assert.ok(html.includes('<div class="fs-stance" data-user="ken&quot;x"></div><div class="fi-actions">'));
    assert.ok(!boot().renderPickCard({}).includes('fs-stance'), 'no username, no slot');
  });

  await t('posting without a quote still goes through the normal composer', async () => {
    const s = boot();
    assert.strictEqual(await s.submitPost(), 'base-submit');
  });

  await t('the composer finds the @name being typed at the caret, and only there', () => {
    const s = boot();
    const tok = (value, caret) => s.TMRFeedSocial._mentionToken({ value, selectionStart: caret == null ? value.length : caret });
    assert.deepStrictEqual({ ...tok('hey @ke') }, { text: 'ke', start: 4, end: 7 });
    assert.deepStrictEqual({ ...tok('@Ken_B') }, { text: 'Ken_B', start: 0, end: 6 });
    assert.strictEqual(tok('mail a@b'), null, 'an email is not a mention');
    assert.strictEqual(tok('hey @ke now'), null, 'the caret has moved past the name');
    assert.deepStrictEqual({ ...tok('hey @ke now', 7) }, { text: 'ke', start: 4, end: 7 });
    assert.strictEqual(tok('hey @'), null);
  });

  console.log(passed + ' passed');
})();
