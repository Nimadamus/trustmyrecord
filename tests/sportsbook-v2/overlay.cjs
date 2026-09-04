// Shared helper: open trustmyrecord.com with LOCAL working-tree files overlaid
// for the v2 preview route + v2 assets, so the real origin/backend/CORS are used
// while the not-yet-deployed files come from disk. Classic (/sportsbook/) is
// never overlaid: it is always the live production page.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const OVERLAY = {
  // SPORTSBOOK_NEXT_20260903 preview (isolated; never served to /sportsbook/)
  '/sportsbook/next/': ['sportsbook/next/index.html', 'text/html; charset=utf-8'],
  '/sportsbook/next/index.html': ['sportsbook/next/index.html', 'text/html; charset=utf-8'],
  '/static/css/sportsbook-next.css': ['static/css/sportsbook-next.css', 'text/css; charset=utf-8'],
  '/static/js/sportsbook-next.js': ['static/js/sportsbook-next.js', 'application/javascript; charset=utf-8'],
  '/static/css/sportsbook-next-v3.css': ['static/css/sportsbook-next-v3.css', 'text/css; charset=utf-8'],
  '/static/js/sportsbook-next-tidy.js': ['static/js/sportsbook-next-tidy.js', 'application/javascript; charset=utf-8'],
  '/sportsbook/v2/': ['sportsbook/v2/index.html', 'text/html; charset=utf-8'],
  '/sportsbook/v2/index.html': ['sportsbook/v2/index.html', 'text/html; charset=utf-8'],
  '/static/css/sportsbook-v2.css': ['static/css/sportsbook-v2.css', 'text/css; charset=utf-8'],
  '/static/js/sportsbook-v2.js': ['static/js/sportsbook-v2.js', 'application/javascript; charset=utf-8'],
  '/static/css/sportsbook-altgame.css': ['static/css/sportsbook-altgame.css', 'text/css; charset=utf-8'],
};
async function installOverlay(context) {
  if (process.env.SBV2_NO_OVERLAY === '1') return;
  // SBV2_OVERLAY_CLASSIC=1 also serves the working-tree production page for
  // /sportsbook/ so a fix can be tested on the real origin before it deploys.
  if (process.env.SBV2_OVERLAY_CLASSIC === '1') {
    OVERLAY['/sportsbook/'] = ['sportsbook/index.html', 'text/html; charset=utf-8'];
    OVERLAY['/sportsbook/index.html'] = ['sportsbook/index.html', 'text/html; charset=utf-8'];
    OVERLAY['/static/js/sportsbook-production-fix-persist-reliability.js'] = ['static/js/sportsbook-production-fix-persist-reliability.js', 'application/javascript; charset=utf-8'];
    OVERLAY['/static/js/sportsbook-multislip.js'] = ['static/js/sportsbook-multislip.js', 'application/javascript; charset=utf-8'];
    // SPORTSBOOK_NEXT_EMBED_20260904: the flagged mount and its stylesheet
    OVERLAY['/static/js/sportsbook-next-embed.js'] = ['static/js/sportsbook-next-embed.js', 'application/javascript; charset=utf-8'];
    OVERLAY['/static/css/sportsbook-next-embed.css'] = ['static/css/sportsbook-next-embed.css', 'text/css; charset=utf-8'];
  }
  await context.route(/^https:\/\/trustmyrecord\.com\/.*/, async (route) => {
    const u = new URL(route.request().url());
    const hit = OVERLAY[u.pathname];
    if (!hit) return route.continue();
    const body = fs.readFileSync(path.join(root, hit[0]));
    return route.fulfill({ status: 200, body, headers: { 'content-type': hit[1], 'cache-control': 'no-store' } });
  });
}
module.exports = { installOverlay, root };
