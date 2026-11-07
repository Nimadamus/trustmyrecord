/* GSC_404_20261107: /profile/?user=<name> must not declare a /u/<name>/
   canonical unless that page exists (Google logged 153 /u/ 404s from it). */
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'profile', 'index.html'), 'utf8');
const m = /<script>\s*(\/\* This \?user= shell[\s\S]*?)<\/script>/.exec(html);
assert(m, 'profile head canonical script not found');
function run(pathname, search, fetchImpl) {
  const tags = {
    'link[rel="canonical"]': { href: 'https://trustmyrecord.com/profile/' },
    'meta[property="og:url"]': { c: 'https://trustmyrecord.com/profile/', setAttribute(k, v) { this.c = v; } },
  };
  const document = { title: '', readyState: 'complete', addEventListener() {},
    querySelector: (sel) => tags[sel] || null };
  const window = { fetch: fetchImpl };
  const location = { pathname, search };
  new Function('window', 'document', 'location', 'fetch', 'URLSearchParams', m[1])(
    window, document, location, fetchImpl, URLSearchParams);
  return tags;
}
const tick = () => new Promise((r) => setTimeout(r, 10));
(async () => {
  let t = run('/profile/', '?user=BetLegend', () => Promise.resolve({ ok: true, redirected: false }));
  await tick();
  assert.strictEqual(t['link[rel="canonical"]'].href, 'https://trustmyrecord.com/u/BetLegend/');
  assert.strictEqual(t['meta[property="og:url"]'].c, 'https://trustmyrecord.com/u/BetLegend/');
  t = run('/profile/', '?user=t3cash', () => Promise.resolve({ ok: false, status: 404 }));
  await tick();
  assert.strictEqual(t['link[rel="canonical"]'].href, 'https://trustmyrecord.com/profile/', 'missing /u/ page must keep /profile/ canonical');
  t = run('/profile/', '?user=x', () => Promise.reject(new Error('net')));
  await tick();
  assert.strictEqual(t['link[rel="canonical"]'].href, 'https://trustmyrecord.com/profile/', 'network failure must keep /profile/ canonical');
  let called = false;
  t = run('/u/BetLegend/', '', () => { called = true; return Promise.resolve({ ok: false }); });
  await tick();
  assert.strictEqual(t['link[rel="canonical"]'].href, 'https://trustmyrecord.com/u/BetLegend/', '/u/ path keeps its own canonical synchronously');
  assert.strictEqual(called, false, '/u/ path must not probe');
  t = run('/profile/', '', () => { throw new Error('should not fetch'); });
  assert.strictEqual(t['link[rel="canonical"]'].href, 'https://trustmyrecord.com/profile/');
  console.log('profile canonical 404 guard test passed (5 cases)');
})().catch((e) => { console.error(e); process.exit(1); });
