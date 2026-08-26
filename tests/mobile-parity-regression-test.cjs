#!/usr/bin/env node
/**
 * Mobile functional-parity regression test.
 *
 * Guards the thing a layout test cannot: that a phone can DO everything a
 * desktop can. Every assertion below was written against a discrepancy that
 * was either found and fixed, or found and proved to be a false alarm, during
 * the 2026-08-25 parity audit. It drives the LIVE site with real browser
 * interaction (WebKit for iPhone Safari, Chromium for Android Chrome) and
 * compares the mobile result with the desktop result rather than with a
 * hardcoded number, so it keeps working as the site's content changes.
 *
 *   node tests/mobile-parity-regression-test.cjs
 *   BASE=http://127.0.0.1:8899 node tests/mobile-parity-regression-test.cjs
 *
 * Requires playwright with webkit installed:
 *   node node_modules/playwright-core/cli.js install webkit
 */
const path = require('path');
const pw = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const BASE = process.env.BASE || 'https://trustmyrecord.com';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const AND_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';

const PROFILES = {
  desktop: { engine: 'chromium', vp: { width: 1440, height: 900 } },
  iphone:  { engine: 'webkit',   vp: { width: 390, height: 844 }, ua: IOS_UA, touch: true },
  android: { engine: 'chromium', vp: { width: 360, height: 800 }, ua: AND_UA, touch: true, isMobile: true },
};

const T = (p, ms) => p.waitForTimeout(ms);
let failures = 0, checks = 0;
const ok = (name, cond, detail) => {
  checks++;
  if (cond) { console.log('  ok    ' + name); }
  else { failures++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};

async function makeCtx(cache, name) {
  const p = PROFILES[name];
  if (!cache[p.engine]) cache[p.engine] = await pw[p.engine].launch();
  return cache[p.engine].newContext({
    viewport: p.vp, userAgent: p.ua, hasTouch: !!p.touch,
    isMobile: !!p.isMobile, deviceScaleFactor: p.touch ? 2 : 1,
  });
}

// Open the hamburger, its sub-menus and the footer accordion. Everything a
// user can reach in one tap counts as reachable.
async function expandNav(page) {
  // The footer is injected by tmr-sitewide.js. Wait for it rather than assuming
  // it has arrived, or a slower engine reports its links as missing.
  await page.waitForSelector('.tmr-global-footer__heading, [class*=footer__heading]', { timeout: 15000 }).catch(() => {});
  // ONE combined selector: the two patterns match the same nodes, and clicking
  // a heading twice toggles the section shut again.
  for (const e of (await page.$$('.tmr-global-footer__heading, [class*=footer__heading]')).slice(0, 8)) {
    try { await e.click({ timeout: 1500 }); await T(page, 200); } catch (x) {}
  }
  await T(page, 400);
  for (const sel of ['.tmr-global-nav__toggle', '.ds-nav-burger', '[class*=nav__toggle]', '[class*=nav-toggle]', '[class*=burger]']) {
    const b = await page.$(sel);
    if (b) { try { await b.click({ timeout: 2000 }); await T(page, 700); } catch (x) {} break; }
  }
  return page;
}

// Every destination reachable from chrome (nav + footer), as a set of hrefs.
// The section menus are an ACCORDION: opening one closes the last. So each is
// opened by label, re-querying the DOM every time, and its links are harvested
// before moving on. Caching element handles here reads a panel the next click
// has already closed, which is what made this look like an Android bug.
async function navDestinations(page) {
  const seen = new Set();
  const grab = async () => {
    (await page.$$eval('a[href]', es => es
      .filter(a => { const r = a.getBoundingClientRect(); return r.width > 2 && r.height > 2; })
      .map(a => a.getAttribute('href'))
    ).catch(() => [])).forEach(h => { if (h && h.startsWith('/')) seen.add(h.split('?')[0].split('#')[0]); });
  };
  await grab();
  const labels = await page.$$eval('[class*=menu__trigger]',
    es => es.map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 14)).filter(Boolean)).catch(() => []);
  for (const label of [...new Set(labels)]) {
    const clicked = await page.evaluate(l => {
      const t = [...document.querySelectorAll('[class*=menu__trigger]')]
        .find(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 14) === l);
      if (!t) return false;
      t.scrollIntoView({ block: 'center' });
      t.click();
      return true;
    }, label);
    if (!clicked) continue;
    await T(page, 800);
    await grab();
  }
  return seen;
}

// Open one section menu by label and report how many links it reveals.
async function openSubMenu(page, label) {
  const clicked = await page.evaluate(l => {
    const t = [...document.querySelectorAll('.tmr-global-nav__panel [class*=menu__trigger]')]
      .find(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 14) === l);
    if (!t) return false;
    t.scrollIntoView({ block: 'center' });
    t.click();
    return true;
  }, label);
  if (!clicked) return -1;
  await T(page, 900);
  return page.evaluate(l => {
    const t = [...document.querySelectorAll('[class*=menu__trigger]')]
      .find(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 14) === l);
    if (!t) return -1;
    const grp = t.closest('.tmr-support-menu, .tmr-sportsbook-menu, .tmr-community-menu') || t.parentElement;
    const p = grp.querySelector('[class*=__panel]');
    return p ? [...p.querySelectorAll('a[href]')].filter(a => a.getBoundingClientRect().height > 2).length : -1;
  }, label);
}

// Tap something and wait for the navigation it should cause.
// A real click is tried first; if Playwright's actionability check loses a race
// with the late-injected nav and footer, the same handler is fired in page
// context. Either way the SITE's handler runs - only the delivery differs.
async function tapAndNavigate(page, selector, expectRe, ms = 20000) {
  const before = page.url();
  const nav = page.waitForURL(expectRe, { timeout: ms }).catch(() => {});
  try { await page.click(selector, { timeout: 6000 }); }
  catch (x) {
    await page.evaluate(sel => {
      const e = document.querySelector(sel);
      if (e) { e.scrollIntoView({ block: 'center' }); e.click(); }
    }, selector);
  }
  await nav;
  await T(page, 2500);
  return { before, after: page.url(), navigated: page.url() !== before };
}

async function run() {
  const cache = {};
  const ctxs = {};
  for (const n of Object.keys(PROFILES)) ctxs[n] = await makeCtx(cache, n);

  // ---------------------------------------------------------------- nav parity
  // Regression: the footer collapses to accordions on a phone. If the headings
  // ever stop toggling, 20 destinations silently disappear from mobile.
  console.log('\nnav: every desktop destination reachable on a phone');
  {
    const dests = {};
    for (const n of Object.keys(PROFILES)) {
      const page = await ctxs[n].newPage();
      await page.goto(BASE + '/picks/', { waitUntil: 'load', timeout: 45000 });
      await T(page, 6000);
      await expandNav(page);
      dests[n] = await navDestinations(page);
      await page.close();
    }
    for (const m of ['iphone', 'android']) {
      const missing = [...dests.desktop].filter(h => !dests[m].has(h));
      ok(m + ': no desktop destination missing', missing.length === 0, missing.slice(0, 6).join(' '));
    }
  }

  // Regression: the mobile menu rendered as a staircase because the section
  // triggers kept justify-content:center from the desktop bar.
  console.log('\nnav: mobile menu rows are left aligned, not a staircase');
  for (const m of ['iphone', 'android']) {
    const page = await ctxs[m].newPage();
    await page.goto(BASE + '/picks/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 5000);
    const b = await page.$('.tmr-global-nav__toggle, [class*=nav__toggle]');
    if (b) await b.click({ timeout: 3000 }).catch(() => {});
    await T(page, 800);
    const lefts = await page.$$eval(
      '.tmr-global-nav__panel [class*=menu__trigger]',
      es => [...new Set(es.filter(e => e.getBoundingClientRect().width > 2).map(e => Math.round(e.getBoundingClientRect().left)))]
    ).catch(() => []);
    ok(m + ': section triggers share one left edge', lefts.length <= 1, 'lefts=' + JSON.stringify(lefts));
    await page.close();
  }

  // Regression: every sub-menu must open. Community and Tools once looked dead.
  console.log('\nnav: every sub-menu opens on a phone');
  for (const m of ['iphone', 'android']) {
    const page = await ctxs[m].newPage();
    await page.goto(BASE + '/picks/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 5000);
    const b = await page.$('.tmr-global-nav__toggle, [class*=nav__toggle]');
    if (b) await b.click({ timeout: 3000 }).catch(() => {});
    await T(page, 800);
    const labels = await page.$$eval('.tmr-global-nav__panel [class*=menu__trigger]',
      es => es.map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 14)).filter(Boolean)).catch(() => []);
    const detail = [];
    let allOpened = labels.length > 0;
    for (const label of [...new Set(labels)]) {
      const n = await openSubMenu(page, label);
      detail.push(label + '=' + n);
      if (n < 1) allOpened = false;
    }
    ok(m + ': all sub-menus reveal links', allOpened, detail.join(' '));
    await page.close();
  }

  // ------------------------------------------------------- interactive controls
  // Regression: the Live Picks strip must stay scrollable, not clipped, so
  // every sport tab can be reached.
  console.log('\nhome: live picks tab strip is reachable');
  for (const m of ['iphone', 'android']) {
    const page = await ctxs[m].newPage();
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 7000);
    const r = await page.evaluate(() => {
      const t = document.querySelector('.tabs');
      if (!t) return null;
      t.scrollLeft = 9999;
      const last = [...t.querySelectorAll('.tab')].pop();
      if (!last) return null;
      const tr = t.getBoundingClientRect(), lr = last.getBoundingClientRect();
      return { ox: getComputedStyle(t).overflowX, lastVisible: lr.right <= tr.right + 2 && lr.left >= tr.left - 2 };
    });
    ok(m + ': last sport tab reachable by scrolling', !!r && r.lastVisible, JSON.stringify(r));
    await page.close();
  }

  // Regression: forum categories are entered by a row click, not a link. If the
  // row handler ever stops firing on touch, the forum is unusable on a phone.
  console.log('\nforum: a category row opens the forum on a phone');
  for (const m of ['iphone', 'android']) {
    const page = await ctxs[m].newPage();
    await page.goto(BASE + '/forum/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 6000);
    // Target a NAMED category so the assertion does not depend on which forum
    // happens to sort first. The row carries the handler; .fname is not a link.
    const before = page.url();
    const nav = page.waitForURL(/\/forum\/mlb\//, { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('tr.frow')]
        .find(x => /MLB Betting/.test((x.querySelector('.fname') || {}).textContent || ''));
      if (row) { const n = row.querySelector('.fname'); n.scrollIntoView({ block: 'center' }); n.click(); }
    });
    await nav; await T(page, 2500);
    ok(m + ': row click navigates into a forum', page.url() !== before && /\/forum\/mlb\//.test(page.url()), page.url());
    await page.close();
  }

  // Regression: profile stats tables live in a scroll shell. If the shell ever
  // loses overflow-x, half of every table is clipped away with no way to reach it.
  console.log('\nprofile: wide stat tables scroll instead of being clipped');
  for (const m of ['iphone']) {
    const page = await ctxs[m].newPage();
    await page.goto(BASE + '/u/BetLegend/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 9000);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const t of document.querySelectorAll('table')) {
        if (getComputedStyle(t).display === 'none') continue;
        const r = t.getBoundingClientRect();
        if (r.width <= innerWidth + 2) continue;
        let scrolls = false;
        for (let n = t.parentElement; n && n !== document.body; n = n.parentElement) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === 'auto' || ox === 'scroll') { scrolls = true; break; }
          if (ox === 'hidden' || ox === 'clip') break;
        }
        if (!scrolls) out.push(t.className || '(table)');
      }
      return out;
    });
    ok(m + ': no wide table is clipped without a scroller', bad.length === 0, bad.slice(0, 4).join(' '));
    await page.close();
  }

  // -------------------------------------------------------------- mobile basics
  console.log('\nbasics: back button, keyboard, popups, live data');
  for (const m of ['iphone', 'android']) {
    // back button restores the previous page
    let page = await ctxs[m].newPage();
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 5000);
    const home = page.url();
    // Tap the link the way a user would, and WAIT for the navigation. Asserting
    // on history without confirming the click navigated tests nothing: goBack()
    // from a single-entry history lands on about:blank.
    const hasLink = await page.evaluate(() => !![...document.querySelectorAll('a[href]')].find(x => x.getAttribute('href') === '/leaderboards/'));
    if (hasLink) {
      const r = await tapAndNavigate(page, 'a[href="/leaderboards/"]', /\/leaderboards\//);
      if (!/\/leaderboards\//.test(r.after)) {
        ok(m + ': back button returns to the previous page', false, 'link tap did not navigate: ' + r.after);
      } else {
        await page.goBack({ waitUntil: 'load', timeout: 30000 }).catch(() => {});
        await T(page, 4000);
        ok(m + ': back button returns to the previous page', page.url() === home, 'landed on ' + page.url());
      }
    }
    await page.close();

    // form stays usable with the keyboard up
    page = await ctxs[m].newPage();
    await page.goto(BASE + '/register/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 4000);
    const vp = page.viewportSize();
    const inp = await page.$('input[name=username], input#username, form input');
    if (inp) {
      await inp.click({ timeout: 3000 }).catch(() => {});
      await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
      await T(page, 500);
      await page.evaluate(() => { const el = document.activeElement; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' }); });
      await T(page, 500);
      const r = await page.evaluate(() => {
        const b = document.activeElement.getBoundingClientRect();
        return { inView: b.top >= 0 && b.bottom <= innerHeight, hOverflow: document.documentElement.scrollWidth > innerWidth + 2 };
      });
      ok(m + ': focused field stays on screen with the keyboard up', r.inView && !r.hOverflow, JSON.stringify(r));
      await page.setViewportSize(vp);
    }
    await page.close();

    // nothing opens off screen
    page = await ctxs[m].newPage();
    await page.goto(BASE + '/handicappers/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 8000);
    const b2 = await page.$('.ds-nav-burger, [class*=nav__toggle], [class*=burger]');
    if (b2) { await b2.click({ timeout: 2500 }).catch(() => {}); await T(page, 800); }
    const off = await page.evaluate(() => {
      const bad = [];
      for (const e of document.querySelectorAll('select, [class*=dropdown], [class*=menu], [class*=modal], [class*=panel], [class*=popover], [class*=tooltip]')) {
        const s = getComputedStyle(e);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.left < -2 || r.right > innerWidth + 2) bad.push((typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : e.tagName));
      }
      return [...new Set(bad)];
    });
    ok(m + ': no popup or menu opens off screen', off.length === 0, off.slice(0, 4).join(' '));
    await page.close();

    // live data keeps arriving on a phone
    page = await ctxs[m].newPage();
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 45000 });
    await T(page, 8000);
    const live = await page.evaluate(() => ({
      games: document.querySelectorAll('.ticker .gm').length,
      picks: document.querySelectorAll('.pk').length,
      board: document.querySelectorAll('.lbr').length,
      comp: document.querySelectorAll('.comp-row').length,
    }));
    ok(m + ': live ticker, picks, leaderboard and competition all populate',
       live.games > 0 && live.picks > 0 && live.board > 0 && live.comp > 0, JSON.stringify(live));
    await page.close();
  }

  // ------------------------------------------------------------ no page scrolls
  console.log('\nlayout: no page scrolls sideways at any common phone width');
  {
    const widths = [320, 360, 375, 390, 412, 430];
    const pages = ['/', '/handicappers/', '/leaderboards/', '/picks/', '/forum/', '/u/BetLegend/'];
    for (const w of widths) {
      const c = await cache.chromium.newContext({
        viewport: { width: w, height: 800 }, userAgent: AND_UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
      });
      const bad = [];
      for (const u of pages) {
        const page = await c.newPage();
        try {
          await page.goto(BASE + u, { waitUntil: 'load', timeout: 40000 });
          await T(page, 5000);
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          if (sw > w + 2) bad.push(u + '=' + sw);
        } catch (x) { bad.push(u + '=ERR'); }
        await page.close();
      }
      ok(w + 'px: no horizontal page scroll', bad.length === 0, bad.join(' '));
      await c.close();
    }
  }

  for (const c of Object.values(ctxs)) await c.close();
  for (const b of Object.values(cache)) await b.close();

  console.log('\n' + (failures ? 'MOBILE PARITY TEST FAILED: ' + failures + ' of ' + checks + ' checks'
                               : 'MOBILE PARITY TEST PASSED: ' + checks + ' checks'));
  process.exit(failures ? 1 : 0);
}

run().catch(e => { console.error('mobile parity test crashed:', e); process.exit(1); });
