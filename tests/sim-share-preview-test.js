'use strict';
/**
 * SIM_SHARE_20261114 - a shared simulation unfurls as its own scoreboard.
 *
 * What went wrong: every simulator's Share button handed out the simulator's
 * own URL (/nfl-simulator/?seed=...). A link preview is built from the HTML a
 * crawler is served, with no JavaScript, and that page's tags describe the
 * simulator ("Free NFL Game Simulator"), so that is what X showed.
 *
 * What is proven here, with no network and no browser:
 *   1. the edge Worker turns /<sport>-simulator/results/run/?id=<n> into that
 *      game's Open Graph and Twitter tags, for all four sports, and leaves the
 *      page's title, description, canonical and robots exactly as they were;
 *   2. it fails open (no metadata, no id, wrong path: the origin page untouched);
 *   3. the archive client resolves a run identity to the run page, retrying
 *      while the archive row is still landing;
 *   4. every simulator's Share control uses that link and keeps the seed link
 *      as the fallback.
 *
 *   node tests/sim-share-preview-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let n = 0;
const ok = (label, cond, detail) => { assert.ok(cond, label + (detail ? ' :: ' + detail : '')); n += 1; };

/* ------------------------------------------------------------------ */
/* A small HTMLRewriter: exactly the selectors the Worker uses.        */
/* ------------------------------------------------------------------ */
class Rewriter {
  constructor() { this.rules = []; }
  on(selector, handler) { this.rules.push({ selector, handler }); return this; }
  transform(response) {
    const rules = this.rules;
    return {
      status: response.status,
      headers: response.headers,
      body: (async () => {
        let html = await response.text();
        for (const { selector, handler } of rules) {
          if (selector === 'head') {
            let add = '';
            handler.element({ append: (s) => { add += s; } });
            html = html.replace('</head>', add + '</head>');
            continue;
          }
          let re = null;
          if (selector === 'title') re = /<title>[\s\S]*?<\/title>\s*/gi;
          else if (selector === 'meta[name="description"]') re = /<meta\s+name="description"[^>]*>\s*/gi;
          else if (selector === 'meta[property^="og:"]') re = /<meta\s+property="og:[^"]*"[^>]*>\s*/gi;
          else if (selector === 'meta[name^="twitter:"]') re = /<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi;
          else if (selector === 'link[rel="canonical"]') re = /<link\s+rel="canonical"[^>]*>\s*/gi;
          else throw new Error('selector not modelled: ' + selector);
          html = html.replace(re, (m) => { let removed = false; handler.element({ remove: () => { removed = true; } }); return removed ? '' : m; });
        }
        return html;
      })(),
    };
  }
}
class Headers2 {
  constructor(o) { this.m = new Map(Object.entries(o || {})); }
  get(k) { return this.m.get(String(k).toLowerCase()) || null; }
  set(k, v) { this.m.set(String(k).toLowerCase(), v); }
}
class Response2 {
  constructor(body, init) { this.bodyValue = body; this.status = (init && init.status) || 200; this.headers = (init && init.headers) || new Headers2(); this.ok = this.status >= 200 && this.status < 300; }
  get body() { return this.bodyValue; }
  async text() { return typeof this.bodyValue === 'string' ? this.bodyValue : await this.bodyValue; }
  async json() { return JSON.parse(await this.text()); }
}

function loadWorker(fetchImpl) {
  const src = read('workers/share-meta/worker.js').replace('export default', 'globalThis.__worker =');
  const ctx = { HTMLRewriter: Rewriter, Response: Response2, URL, AbortController, setTimeout, clearTimeout, fetch: fetchImpl, console };
  ctx.globalThis = ctx;
  vm.runInNewContext(src, ctx);
  return ctx.__worker;
}

const META = (sport, id, title) => ({
  ok: true, type: 'sim', socialOnly: true,
  title, description: 'In this ' + sport.toUpperCase() + ' simulation the home side won. A simulated game, not a real result.',
  canonical: 'https://trustmyrecord.com/' + sport + '-simulator/results/run/?id=' + id,
  url: 'https://trustmyrecord.com/' + sport + '-simulator/results/run/?id=' + id,
  image: 'https://api.trustmyrecord.com/api/share/og/sim/' + id + '.png',
  imageAlt: 'Simulated final score. Not a real game.', ogType: 'article', twitterCard: 'summary_large_image',
});

function tag(html, attr, name) {
  const re = new RegExp('<meta\\s+' + attr + '="' + name.replace(/[.:]/g, '\\$&') + '"\\s+content="([^"]*)"', 'gi');
  const out = []; let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

(async () => {
  /* ---------------- 1 + 2: the edge Worker ---------------- */
  for (const sport of ['nfl', 'nba', 'mlb', 'nhl']) {
    const pagePath = sport + '-simulator/results/run/index.html';
    const origin = read(pagePath);
    const originTitle = /<title>([\s\S]*?)<\/title>/.exec(origin)[1];
    const originCanonical = /<link rel="canonical" href="([^"]+)"/.exec(origin)[1];
    const title = 'Simulated Final: Away Club 21, Home Club 30 | TrustMyRecord ' + sport.toUpperCase() + ' Simulator';
    const asked = [];
    const worker = loadWorker(async (req) => {
      const url = typeof req === 'string' ? req : req.url;
      asked.push(url);
      if (url.indexOf('/share/meta/sim/4242') > 0) return new Response2(JSON.stringify(META(sport, '4242', title)));
      if (url.indexOf('/share/meta/') > 0) return new Response2('{"ok":false}', { status: 404 });
      return new Response2(origin, { headers: new Headers2({ 'content-type': 'text/html; charset=utf-8' }) });
    });
    const hit = async (u) => {
      const res = await worker.fetch({ method: 'GET', url: u });
      return { html: await res.text(), marker: res.headers.get('x-tmr-share-meta') };
    };

    const base = 'https://trustmyrecord.com/' + sport + '-simulator/results/run/';
    const shared = await hit(base + '?id=4242');
    ok(sport + ': the run page is recognised', shared.marker === 'sim:4242', String(shared.marker));
    ok(sport + ': og:title is this game', tag(shared.html, 'property', 'og:title').join('|') === title);
    ok(sport + ': og:image is this game\'s card, once',
      tag(shared.html, 'property', 'og:image').join('|') === 'https://api.trustmyrecord.com/api/share/og/sim/4242.png');
    ok(sport + ': og:url is this game\'s page', tag(shared.html, 'property', 'og:url').join('|') === base + '?id=4242');
    ok(sport + ': og:description says simulation', /simulation/.test(tag(shared.html, 'property', 'og:description').join('|')));
    ok(sport + ': large image card', tag(shared.html, 'name', 'twitter:card').join('|') === 'summary_large_image');
    ok(sport + ': twitter:title is this game', tag(shared.html, 'name', 'twitter:title').join('|') === title);
    ok(sport + ': twitter:image is this game\'s card', tag(shared.html, 'name', 'twitter:image').join('|') === 'https://api.trustmyrecord.com/api/share/og/sim/4242.png');
    ok(sport + ': image size is declared', tag(shared.html, 'property', 'og:image:width').join('|') === '1200' && tag(shared.html, 'property', 'og:image:height').join('|') === '630');
    ok(sport + ': the generic simulator preview is gone', shared.html.indexOf('og-' + sport + '-simulator.png') < 0 && tag(shared.html, 'name', 'twitter:card').length === 1);
    ok(sport + ': the page title is untouched', (shared.html.match(/<title>/g) || []).length === 1 && shared.html.indexOf('<title>' + originTitle + '</title>') >= 0);
    ok(sport + ': the canonical is untouched', (shared.html.match(/rel="canonical"/g) || []).length === 1 && shared.html.indexOf('<link rel="canonical" href="' + originCanonical + '"') >= 0);
    ok(sport + ': no robots tag is added', (shared.html.match(/name="robots"/g) || []).length === (origin.match(/name="robots"/g) || []).length);
    ok(sport + ': the page body is untouched', shared.html.split('</head>')[1] === origin.split('</head>')[1]);

    const unknown = await hit(base + '?id=999');
    ok(sport + ': an unknown run is served untouched', unknown.html === origin && !unknown.marker);
    const noId = await hit(base);
    ok(sport + ': the bare run page is served untouched', noId.html === origin && !noId.marker);
    const bad = await hit(base + '?id=abc');
    ok(sport + ': a non numeric id is served untouched', bad.html === origin && !bad.marker);
    const sim = await hit('https://trustmyrecord.com/' + sport + '-simulator/?id=4242');
    ok(sport + ': the simulator page itself is never rewritten', sim.html === origin && !sim.marker);
  }
  const toml = read('workers/share-meta/wrangler.toml');
  for (const sport of ['nfl', 'nba', 'mlb', 'nhl']) {
    for (const host of ['trustmyrecord.com', 'www.trustmyrecord.com']) {
      ok('route: ' + host + ' ' + sport, toml.indexOf('pattern = "' + host + '/' + sport + '-simulator/results/run*"') > 0);
    }
  }

  /* ---------------- 3: the archive client ---------------- */
  const timers = [];
  const calls = [];
  let answers = [404, 404, 200];
  const win = {
    location: { origin: 'https://trustmyrecord.com', search: '', pathname: '/nba-simulator/' },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
  };
  const doc = { readyState: 'loading', addEventListener: () => {} };
  const ctx = {
    window: win, document: doc, console,
    fetch: (url) => {
      calls.push(url);
      const status = answers.shift();
      return Promise.resolve({ ok: status === 200, json: () => Promise.resolve({ id: '777', sport: 'nba', path: '/nba-simulator/results/run/?id=777' }) });
    },
  };
  vm.runInNewContext(read('static/js/tmr-sim-archive.js'), ctx);
  const A = win.TMRSimArchive;
  ok('the archive client exposes the share link', typeof A.primeShare === 'function' && typeof A.shareUrlFor === 'function');
  const tick = () => new Promise((r) => setImmediate(r));
  A.primeShare('nba:abc123abc123');
  A.primeShare('nba:abc123abc123');
  await tick(); await tick();
  ok('one request per run, however often it is primed', calls.length === 1, String(calls.length));
  ok('asks the archive by identity', /\/sim-archive\/runs\/by-uid\/nba%3Aabc123abc123$/.test(calls[0]), calls[0]);
  ok('no link while the row is still landing', A.shareUrlFor('nba:abc123abc123') === null);
  timers.shift()(); await tick(); await tick();
  timers.shift()(); await tick(); await tick();
  ok('the link is the run\'s own page once the row exists',
    A.shareUrlFor('nba:abc123abc123') === 'https://trustmyrecord.com/nba-simulator/results/run/?id=777', String(A.shareUrlFor('nba:abc123abc123')));
  ok('an unknown identity has no link', A.shareUrlFor('nba:other') === null && A.shareUrlFor('') === null);
  answers = [200];
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ id: '1', path: 'https://evil.example/x' }) });
  A.primeShare('nba:zzzzzzzzzzzz'); await tick(); await tick();
  ok('a path that is not a run page is never used', A.shareUrlFor('nba:zzzzzzzzzzzz') === null);

  /* ---------------- 4: every simulator's Share control ---------------- */
  const core = read('static/js/tmr-sim-core.js');
  ok('NBA / NHL: the result primes its link', /lastResult = d;[\s\S]{0,400}primeShare\(d\.archive_uid\)/.test(core));
  ok('NBA / NHL: Share uses the run page', /shareUrlFor\(r\.archive_uid\)/.test(core));
  ok('NBA / NHL: the seed link is still the fallback', /var url = global\.location\.href;/.test(core));
  for (const sport of ['nba', 'nhl']) {
    const html = read(sport + '-simulator/index.html');
    const m = /tmr-sim-core\.([0-9a-f]{12})\.js/.exec(html);
    ok(sport + ': the page loads a hashed core', !!m);
    ok(sport + ': the hashed core is the current core',
      fs.readFileSync(path.join(ROOT, 'static/js/tmr-sim-core.' + m[1] + '.js'), 'utf8').replace(/\r\n/g, '\n') === core.replace(/\r\n/g, '\n'));
    ok(sport + ': the archive client is on the page', html.indexOf('/static/js/tmr-sim-archive.js') > 0);
  }
  const nfl = read('nfl-simulator/index.html');
  ok('NFL: the result notes its archive identity, both run paths', (nfl.match(/simShareNote\(d\);/g) || []).length === 2);
  ok('NFL: Copy link uses the run page', /async function copyShare\(btn\)\{\s*const url=shareLink\(\);/.test(nfl));
  ok('NFL: the share sheet uses the run page', /sh\.onclick=\(\)=>\{const u=shareLink\(\);/.test(nfl));
  // SIM_FRESH_EVERY_RUN_20261121: the fallback seed link is marked shared=1 so it replays for the reader.
  ok('NFL: the seed link is still the fallback', /function shareLink\(\)\{[\s\S]{0,700}const u=shareUrl\(\);[\s\S]{0,200}searchParams\.set\('shared','1'\)/.test(nfl));
  ok('NFL: only a shared link replays its seed', (nfl.match(/q\.get\('shared'\)==='1'\)PENDING_SEED/g) || []).length === 2 && /if\(g&&q\.get\('shared'\)==='1'\)PENDING_SEED/.test(nfl));
  ok('NBA / NHL: only a shared link replays its seed', /q\.get\('shared'\) === '1' \? \{ seed: seed/.test(core) && /searchParams\.set\('shared', '1'\)/.test(core));
  ok('NFL: the archive client is on the page', nfl.indexOf('/static/js/tmr-sim-archive.js') > 0);
  const mlb = read('static/js/mlb-simulator.js');
  ok('MLB: Copy Share Link uses the run page', /copyText\(shareLinkFor\(state\.simulation\)/.test(mlb));
  ok('MLB: the copied result text carries the run page', /var url = shareLinkFor\(result\);/.test(mlb));
  ok('MLB: the seed link is still the fallback', /function shareLinkFor\(result\) \{[\s\S]{0,700}return shareUrlFor\(result\);/.test(mlb));
  const rec = read('static/js/mlb-sim-history-record.js');
  ok('MLB: the recorded game carries its identity', /result\.archive_uid = payload\.run_uid;/.test(rec));
  ok('MLB: the link is asked for once the run is recorded', /\.then\(primeShare\)/.test(rec));
  ok('MLB: the archive client is on the page', read('mlb-simulator/index.html').indexOf('/static/js/tmr-sim-archive.js') > 0);

  console.log('sim-share-preview-test: ' + n + ' checks passed');
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
