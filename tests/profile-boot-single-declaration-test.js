#!/usr/bin/env node
/**
 * REGRESSION LOCK — /u/<username>/ profile boot (2026-08-06)
 *
 * Locks the three defects that made a public profile page show a broken shell for
 * several seconds before the real profile appeared:
 *
 *   1. Uncaught SyntaxError: Identifier 'TrustMyRecordAPI' has already been declared.
 *      static/js/backend-api.js declared the class as a top-level lexical binding,
 *      and tmr-profile-hydrate.js mounts the /profile/ app at the /u/ URL with
 *      document.open()/write() — which replaces the DOM but NOT the JS realm. Any
 *      second execution in that realm threw and aborted the entire file.
 *
 *   2. The baked SEO snapshot (a cron-refreshed, up-to-30-minutes-stale bake) was
 *      the first paint, so visitors read an out-of-date profile while the live one
 *      loaded behind it.
 *
 *   3. The baked page eagerly loaded the same chrome scripts the app shell loads,
 *      so every one of them executed twice in one realm — duplicate downloads,
 *      duplicate listeners, duplicate /api/auth/me calls.
 *
 * Static + in-process only: no network, no browser. Live proof lives in
 * tests/profile-boot-live-proof.cjs.
 *
 * Run: node tests/profile-boot-single-declaration-test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
  } catch (err) {
    failures++;
    console.error('  FAIL  ' + name + '\n        ' + (err && err.message));
  }
}

// ---------------------------------------------------------------------------
// 1. The API client survives being executed twice in one realm.
// ---------------------------------------------------------------------------
function makeRealm() {
  const store = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: () => Promise.reject(new Error('offline test')),
    CONFIG: { api: { baseUrl: 'https://example.invalid/api' } },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    location: { hostname: 'trustmyrecord.com', origin: 'https://trustmyrecord.com', href: 'https://trustmyrecord.com/u/x/' },
    navigator: { userAgent: 'node' },
    document: { addEventListener() {}, querySelector: () => null, createElement: () => ({ setAttribute() {}, style: {} }) },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  return vm.createContext(sandbox);
}

check('backend-api.js executes twice in one realm without redeclaring', () => {
  const src = read('static/js/backend-api.js');
  const ctx = makeRealm();
  vm.runInContext(src, ctx, { filename: 'backend-api.js#1' });
  const first = ctx.api;
  assert.ok(ctx.TrustMyRecordAPI, 'first execution must publish window.TrustMyRecordAPI');
  assert.ok(first, 'first execution must publish window.api');

  // This is the exact condition that produced the production SyntaxError: the
  // same file running a second time inside a realm that outlived document.write().
  vm.runInContext(src, ctx, { filename: 'backend-api.js#2' });

  assert.strictEqual(ctx.api, first,
    're-execution must reuse the existing singleton, not build a second client');
});

check('backend-api.js keeps its definitions inside the guarded IIFE', () => {
  const src = read('static/js/backend-api.js');
  const body = src.slice(src.indexOf('*/') + 2);          // past the header comment
  assert.ok(/^\s*\(function \(\) \{/.test(body),
    'the file must open with the single-definition IIFE');
  const guardIdx = src.indexOf('if (g && g.TrustMyRecordAPI)');
  const classIdx = src.search(/^class\s+TrustMyRecordAPI\b/m);
  assert.ok(guardIdx > 0, 'the "already defined in this realm" guard is gone');
  assert.ok(classIdx > guardIdx,
    'class TrustMyRecordAPI must be declared AFTER the guard, inside the IIFE');
  assert.ok(/g\.TrustMyRecordAPI = TrustMyRecordAPI;/.test(src),
    'the class must be published on the global object, not left as a lexical binding');
});

check('exactly one file in the repo declares class TrustMyRecordAPI', () => {
  const hits = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'artifacts', 'test-results', 'playwright-report'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|html)$/.test(entry.name)) continue;
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (rel.startsWith('tests/')) continue;
      // A real declaration, not a mention of the identifier in a comment.
      const declared = fs.readFileSync(full, 'utf8')
        .split(/\r?\n/)
        .some((l) => /^\s*class\s+TrustMyRecordAPI\b/.test(l));
      if (declared) {
        hits.push(rel);
      }
    }
  })(ROOT);
  assert.deepStrictEqual(hits, ['static/js/backend-api.js'],
    'the API client must be defined in exactly one place, found: ' + JSON.stringify(hits));
});

// ---------------------------------------------------------------------------
// 2. Script loaders guard on the realm, not on the DOM.
// ---------------------------------------------------------------------------
check('tmr-ds-nav.js dependency loader guards on window.__TMR_SCRIPTS_LOADED', () => {
  const src = read('static/js/tmr-ds-nav.js');
  assert.ok(/__TMR_SCRIPTS_LOADED/.test(src),
    'loadChain() must record loads on window — a DOM-only guard is erased by document.write()');
});

check('tmr-sitewide.js dependency loader guards on window.__TMR_SCRIPTS_LOADED', () => {
  const src = read('static/js/tmr-sitewide.js');
  assert.ok(/__TMR_SCRIPTS_LOADED/.test(src),
    'the notifications dependency chain must record loads on window, not only in the DOM');
});

check('tmr-sitewide.js does not append a second query string to a stamped src', () => {
  const src = read('static/js/tmr-sitewide.js');
  assert.ok(!/\.src\s*=\s*src\s*\+\s*["']\?v=/.test(src),
    'src + "?v=..." produces ".js?v=<hash>?v=<tag>", a second cache entry for an identical file');
});

check('tmr-profile-hydrate.js neutralises the pre-swap realm before document.write', () => {
  const src = read('static/js/tmr-profile-hydrate.js');
  const swapIdx = src.indexOf('document.open();');
  assert.ok(swapIdx > 0, 'expected the document.open()/write() swap to still be here');
  assert.ok(src.lastIndexOf('__TMR_PROFILE_SWAPPED = true', swapIdx) > 0,
    'the realm must be flagged as swapped BEFORE document.open(), so stale callbacks bail');
  assert.ok(/if \(legacyStarted \|\| window\.__TMR_PROFILE_SWAPPED\) return;/.test(src),
    'the legacy hydrate path must no-op once the app shell owns the document');
});

// ---------------------------------------------------------------------------
// 3. Every baked /u/<username>/ page honours the first-paint contract.
// ---------------------------------------------------------------------------
const uDir = path.join(ROOT, 'u');
const profiles = fs.existsSync(uDir)
  ? fs.readdirSync(uDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(uDir, d.name, 'index.html')))
      .map((d) => d.name)
  : [];

check('there are baked profile pages to check', () => {
  assert.ok(profiles.length > 0, 'no /u/<username>/index.html pages found');
});

const manifest = JSON.parse(read('static/ds-assets.json'));
const hydrateUrl = manifest['static/js/tmr-profile-hydrate.js'];

check('the hashed hydrate build named in the manifest exists on disk', () => {
  assert.ok(hydrateUrl, 'tmr-profile-hydrate.js missing from static/ds-assets.json');
  assert.ok(fs.existsSync(path.join(ROOT, hydrateUrl.replace(/^\//, ''))),
    'manifest points at a file that was never built: ' + hydrateUrl);
});

check('every baked profile page hides its stale snapshot at first paint', () => {
  const bad = [];
  for (const un of profiles) {
    const html = read(path.join('u', un, 'index.html'));
    if (!/<body[^>]*class="[^"]*\btmr-u-booting\b/.test(html)) bad.push(un + ': body is missing tmr-u-booting');
    else if (!/id="tmrUBoot"/.test(html)) bad.push(un + ': no branded loading skeleton');
    else if (!/<noscript><style>[^<]*tmr-u-booting/.test(html)) bad.push(un + ': no <noscript> reveal for crawlers/no-JS');
  }
  assert.strictEqual(bad.length, 0, bad.slice(0, 5).join('\n'));
});

check('no baked profile page executes a script the app shell also loads', () => {
  // Anything other than the hydrate script must ship inert (type="text/tmr-fallback"),
  // because this document is replaced wholesale ~100ms in and the /profile/ shell
  // loads its own copy of every one of them into the SAME realm.
  const bad = [];
  for (const un of profiles) {
    const html = read(path.join('u', un, 'index.html'));
    const executable = (html.match(/<script\b[^>]*\bsrc=(?:"|')([^"']+)(?:"|')[^>]*>/g) || [])
      .filter((tag) => !/type=["']text\/tmr-fallback["']/.test(tag))
      .map((tag) => (tag.match(/src=(?:"|')([^"']+)/) || [])[1]);
    const unexpected = executable.filter((src) => !/tmr-profile-hydrate\./.test(src));
    if (unexpected.length) bad.push(un + ': ' + unexpected.join(', '));
  }
  assert.strictEqual(bad.length, 0,
    'baked pages must load ONLY the hydrate script eagerly:\n' + bad.slice(0, 5).join('\n'));
});

check('every baked profile page points at the current hydrate build', () => {
  const stale = profiles.filter((un) => !read(path.join('u', un, 'index.html')).includes(hydrateUrl));
  assert.strictEqual(stale.length, 0,
    'stale hydrate hash on: ' + stale.slice(0, 5).join(', ') +
    ' — run build_ds_assets.py then build_profile_pages.py');
});

check('every baked profile page preflights the app shell inline in <head>', () => {
  const bad = profiles.filter((un) => {
    const html = read(path.join('u', un, 'index.html'));
    const head = html.slice(0, html.indexOf('<body'));
    return !head.includes('__TMR_SHELL_PROMISE') || !head.includes('__TMR_PROFILE_PRELOAD');
  });
  assert.strictEqual(bad.length, 0, 'no <head> preflight on: ' + bad.slice(0, 5).join(', '));
});

check('the profile app consumes the preload instead of refetching metrics', () => {
  const html = read('profile/index.html');
  assert.ok(/window\.__TMR_PROFILE_PRELOAD/.test(html),
    'profile/index.html must consume window.__TMR_PROFILE_PRELOAD in loadAdvancedMetrics()');
});

check('baked profile pages stay indexable', () => {
  // Guard rail: this fix hides the baked body from JS clients. It must never
  // become an indexing change. NEVER noindex anything on this site.
  const bad = profiles.filter((un) => /noindex/i.test(read(path.join('u', un, 'index.html'))));
  assert.strictEqual(bad.length, 0, 'noindex found on: ' + bad.join(', '));
});

console.log(failures === 0
  ? '\nprofile-boot-single-declaration-test: all checks passed'
  : `\nprofile-boot-single-declaration-test: ${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
