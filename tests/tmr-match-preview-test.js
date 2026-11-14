/**
 * MATCH_PREVIEW_20261114 -- while TMR Match is not taking offers, the page shows
 * a labelled preview board and never invites a post it would refuse.
 *
 * Runs the page's own script in jsdom against a stubbed API.
 *
 *   NODE_PATH=<dir with jsdom> node tests/tmr-match-preview-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'tmr-match', 'index.html'), 'utf8');

async function boot(opts) {
  const calls = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://trustmyrecord.com/tmr-match/',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(), // page chatter from scripts this test does not load
    beforeParse(window) {
      if (opts.loggedIn) {
        ['trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'].forEach((k) => window.localStorage.setItem(k, 'x'));
        window.localStorage.setItem('trustmyrecord_session', JSON.stringify({ user: { id: 1, username: 'me' }, token: 'x' }));
        window.localStorage.setItem('currentUser', JSON.stringify({ id: 1, username: 'me' }));
      }
      window.isUserLoggedIn = () => !!opts.loggedIn;
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      window.scrollTo = () => {};
      window.Element.prototype.scrollIntoView = () => {};
      window.api = {
        token: opts.loggedIn ? 'x' : null,
        request: async (p, o) => {
          calls.push((o && o.method ? o.method : 'GET') + ' ' + p);
          if (p === '/tmr-match/meta') return { enabled: opts.enabled, min_quantity: 10 };
          if (p === '/tmr-match/offers') return { offers: opts.offers || [] };
          if (p === '/tmr-match/depth') return { depth: [] };
          if (p === '/tmr-match/mine') return { offers: [] };
          if (p === '/tmr-match/fills') return { fills: [] };
          if (p === '/auth/me') return { user: { id: 1, username: 'me' } };
          if (p === '/coins/balance') return { wallet: { balance: 266 } };
          throw new Error('unexpected ' + p);
        },
      };
    },
  });
  await new Promise((r) => setTimeout(r, 250));
  return { window: dom.window, document: dom.window.document, calls };
}

let passed = 0;
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

(async () => {
  await t('closed and empty: preview board, five example rows, nothing acceptable', async () => {
    const { document, calls } = await boot({ enabled: false, loggedIn: true });
    assert.ok(document.body.classList.contains('mk-preview') && document.body.classList.contains('mk-closed'));
    assert.strictEqual(document.querySelectorAll('#listMarket .row').length, 5);
    assert.strictEqual(document.querySelectorAll('#liveList .lv').length, 5);
    assert.strictEqual(document.querySelectorAll('#mk [data-open]').length, 0, 'an example offer must not be acceptable');
    assert.strictEqual(document.querySelectorAll('#listMarket .px-demo').length, 5);
    assert.strictEqual(document.getElementById('closedNote').hidden, false);
    assert.strictEqual(document.getElementById('emptyMarket').hidden, true);
    assert.strictEqual(document.getElementById('slip').hidden, true, 'no bet slip for a preview');
    assert.ok(!document.querySelector('#listMarket img.av'), 'no member avatar is requested for an example');
    assert.ok(document.getElementById('listMarket').textContent.includes('Member A'));
    assert.ok(!calls.some((c) => /^POST/.test(c)));
  });

  await t('closed: Create Match is locked and cannot open the form', async () => {
    const { document } = await boot({ enabled: false, loggedIn: true });
    const cta = document.getElementById('ctaPost');
    assert.strictEqual(cta.disabled, true);
    assert.ok(/Not Open Yet/.test(cta.textContent));
    document.querySelector('.mk-tab[data-tab="mine"]').click();
    document.querySelectorAll('[data-tab="create"]').forEach((b) => { b.disabled = false; b.click(); });
    assert.strictEqual(document.getElementById('panel-create').hidden, true, 'the post form must stay closed');
  });

  await t('closed but a real offer is still open: the real board shows, no preview', async () => {
    const offers = [{ id: 7, maker_id: 2, maker_username: 'ken', sport: 'NFL', event_label: 'A vs B', event_ref: 'a-b', market: 'spread', selection: 'A -3', side: 'for', price_american: -110, quantity: 100, remaining: 100, filled_quantity: 0, status: 'open', created_at: '2026-11-13T00:00:00Z' }];
    const { document } = await boot({ enabled: false, loggedIn: true, offers });
    assert.ok(!document.body.classList.contains('mk-preview'));
    assert.strictEqual(document.querySelectorAll('#listMarket .row').length, 1);
    assert.strictEqual(document.querySelectorAll('#listMarket .px-demo').length, 0);
  });

  await t('open market: no preview, no closed note, Create Match works', async () => {
    const { document } = await boot({ enabled: true, loggedIn: true });
    assert.ok(!document.body.classList.contains('mk-preview') && !document.body.classList.contains('mk-closed'));
    assert.strictEqual(document.getElementById('closedNote').hidden, true);
    assert.strictEqual(document.querySelectorAll('#listMarket .row').length, 0);
    assert.strictEqual(document.getElementById('emptyMarket').hidden, false);
    const cta = document.getElementById('ctaPost');
    assert.strictEqual(cta.disabled, false);
    cta.click();
    assert.strictEqual(document.getElementById('panel-create').hidden, false);
  });

  await t('closed, signed out: preview shows and nothing asks for a sign in to post', async () => {
    const { document } = await boot({ enabled: false, loggedIn: false });
    assert.strictEqual(document.querySelectorAll('#listMarket .row').length, 5);
    assert.strictEqual(document.getElementById('ctaSignIn').hidden, true);
    assert.strictEqual(document.querySelectorAll('#listMarket a.px[href="/login/"]').length, 0);
  });

  console.log(passed + ' passed');
})();
