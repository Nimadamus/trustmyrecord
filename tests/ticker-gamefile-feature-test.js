/* =============================================================================
   The featured Game File ticker card.

   Three properties are worth locking, and they are the three that were actually
   broken while building this:

   1. FAILS SILENT. No published Game File must mean no badge, no /matchups link
      and no styling. A dead link in the ticker is worse than no link.
   2. COSTS NO LAYOUT. Featuring a card must not change the ticker's height, the
      card's width, or the position of any other game. Two earlier attempts
      reserved horizontal space for the badge and pushed the three games to the
      right of it along by 65px.
   3. RESPECTS prefers-reduced-motion.

   Runs against the built homepage over a local static server on an ephemeral
   port, with BOTH the slate and /api/matchups/today stubbed. Neither is live:
   a fixed port collided with a not-yet-released socket from the previous run,
   and hitting the real slate made the assertions depend on Mets-Braves still
   being on today's board.
   ========================================================================== */
'use strict';

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let PORT = 0;   // assigned by the OS in serve()
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
               '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
               '.woff2': 'font/woff2', '.xml': 'application/xml' };

let failures = 0;
const ok  = (m) => console.log('  ok    ' + m);
const bad = (m) => { console.log('  FAIL  ' + m); failures++; };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      fs.readFile(f, (e, d) => {
        if (e) { r.writeHead(404); return r.end('nf'); }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        r.end(d);
      });
    });
    s.listen(0, () => { PORT = s.address().port; res(s); });
  });
}

function measure(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('.ticker .gm')];
    const strip = document.querySelector('.ticker');
    const gf = document.querySelector('.ticker .gm--gf');
    return {
      tickerH: strip ? Math.round(strip.getBoundingClientRect().height) : null,
      geometry: all.map((c) => Math.round(c.getBoundingClientRect().x) + ':' +
                               Math.round(c.getBoundingClientRect().width)).join('|'),
      featured: !!gf,
      href: gf ? gf.getAttribute('href') : null,
      badge: gf ? !!gf.querySelector('.gm-gf') : false,
      aria: gf ? gf.getAttribute('aria-label') : null,
      matchupLinks: all.filter((c) => /\/matchups\//.test(c.getAttribute('href') || '')).length,
    };
  });
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { console.log('  SKIP  playwright not installed'); process.exit(0); }

  const server = await serve();
  const browser = await chromium.launch();
  try {
    /* The slate date and the fixture times are TODAY's, computed at run time.
       They used to be hard-coded to 2026-08-10, which was "today" on the day
       this test was written — and tmr-home-live.js deliberately refuses a slate
       whose slate_date is not the current Pacific date (a guard against a
       response that raced across a date rollover). So from 2026-08-11 onwards
       the stub was rejected, the ticker rendered "temporarily unavailable", and
       all five featured-card assertions failed every single day. A test that
       only passes on one calendar date is not a test. */
    const PT = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const at = (hhmm) => `${PT}T${hhmm}:00.000Z`;

    const SLATE = {
      ok: true, slate_date: PT, games: [
        { game_pk: 111, away: 'BOS', home: 'TOR', away_team_name: 'Boston Red Sox',
          home_team_name: 'Toronto Blue Jays', start_time_utc: at('22:07'),
          status: 'scheduled', away_pitcher: 'S. Gray', home_pitcher: 'J. Taillon' },
        { game_pk: 222, away: 'NYM', home: 'ATL', away_team_name: 'New York Mets',
          home_team_name: 'Atlanta Braves', start_time_utc: at('23:15'),
          status: 'scheduled', away_pitcher: 'C. Scott', home_pitcher: 'B. Elder' },
        { game_pk: 333, away: 'BAL', home: 'MIN', away_team_name: 'Baltimore Orioles',
          home_team_name: 'Minnesota Twins', start_time_utc: at('23:40'),
          status: 'scheduled', away_pitcher: 'T. Rogers', home_pitcher: 'D. Kremer' },
      ],
    };

    const FEATURED = {
      ok: true,
      featured: {
        status: 'published',
        url: 'https://trustmyrecord.com/matchups/mlb/mets-vs-braves-g1000/',
        away_team: 'New York Mets', home_team: 'Atlanta Braves',
        game_time_utc: at('23:15'),
      },
    };

    /* ---- with a published Game File ---------------------------------- */
    let page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/api/nav/mlb-slate*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLATE) }));
    await page.route('**/api/matchups/today', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEATURED) }));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    const on = await measure(page);
    await page.close();

    /* ---- the game_pk path: ANY game with a breakdown, not just the cover ---
       The featured article here is deliberately a DIFFERENT game (the Orioles
       fixture) while `games` names the Mets one. The old code matched the
       featured article by team name and would have marked the Orioles card. The
       ticker's question is "does THIS game have a breakdown?", so the Mets card
       is the one that must light up. */
    {
      const byPk = {
        ok: true,
        featured: { status: 'published', url: 'https://trustmyrecord.com/x/',
                    away_team: 'Baltimore Orioles', home_team: 'Minnesota Twins',
                    game_time_utc: at('23:40') },
        games: [{ game_pk: 222, url: 'https://trustmyrecord.com/matchup-of-the-day/mets-braves-x/',
                  away_team: 'New York Mets', home_team: 'Atlanta Braves' }],
      };
      const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await pg.route('**/api/nav/mlb-slate*', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLATE) }));
      await pg.route('**/api/matchups/today', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(byPk) }));
      await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
      await pg.waitForTimeout(1400);
      const which = await pg.evaluate(() => {
        const c = document.querySelector('.ticker .gm--gf');
        return c ? { pk: c.getAttribute('data-game-pk'), href: c.getAttribute('href'),
                     badge: c.querySelector('.gm-gf') ? c.querySelector('.gm-gf').textContent : null } : null;
      });
      await pg.close();

      if (which && which.pk === '222') ok('game_pk map: the game WITH a breakdown is the one marked');
      else bad('game_pk map: marked ' + JSON.stringify(which) + ', expected game_pk 222');

      if (which && /matchup-of-the-day/.test(which.href || '')) ok("game_pk map: links to that game's article");
      else bad('game_pk map: wrong href ' + (which && which.href));

      if (which && which.badge === 'PREVIEW') ok('game_pk map: badge reads PREVIEW');
      else bad('game_pk map: badge reads ' + (which && which.badge));
    }

    /* ---- two eligible games, exactly ONE card marked --------------------
       Clubs play series and the window is deliberately wider than a day, so the
       API can legitimately name more than one game with a breakdown. Two lit
       cards makes neither look like the pick of the day, so the ticker takes the
       first placeable one and stops. The list arrives featured-first, so that is
       also the right one. */
    {
      const two = {
        ok: true, featured: null,
        games: [
          { game_pk: 222, url: 'https://trustmyrecord.com/matchup-of-the-day/a/',
            away_team: 'New York Mets', home_team: 'Atlanta Braves' },
          { game_pk: 333, url: 'https://trustmyrecord.com/matchup-of-the-day/b/',
            away_team: 'Baltimore Orioles', home_team: 'Minnesota Twins' },
        ],
      };
      const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await pg.route('**/api/nav/mlb-slate*', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLATE) }));
      await pg.route('**/api/matchups/today', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(two) }));
      await pg.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
      await pg.waitForTimeout(1400);
      const count = await pg.evaluate(() => ({
        marked: document.querySelectorAll('.ticker .gm--gf').length,
        badges: document.querySelectorAll('.ticker .gm-gf').length,
        first: (document.querySelector('.ticker .gm--gf') || {}).getAttribute
          ? document.querySelector('.ticker .gm--gf').getAttribute('data-game-pk') : null,
      }));
      await pg.close();

      if (count.marked === 1) ok('two eligible games: exactly one card is marked');
      else bad('two eligible games: ' + count.marked + ' cards marked, expected 1');

      if (count.badges === 1) ok('two eligible games: exactly one PREVIEW badge');
      else bad('two eligible games: ' + count.badges + ' badges, expected 1');

      if (count.first === '222') ok('two eligible games: the first in the list wins');
      else bad('two eligible games: marked pk ' + count.first + ', expected the first (222)');
    }

    /* ---- with none published ----------------------------------------- */
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/api/nav/mlb-slate*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLATE) }));
    await page.route('**/api/matchups/today', (r) => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    const off = await measure(page);
    await page.close();

    if (!on.featured) bad('a published Game File should feature its ticker card');
    else ok('published: the matching ticker card is featured');

    if (on.href === FEATURED.featured.url) ok('published: the whole card links to the canonical article');
    else bad(`published: card href is ${on.href}, expected the canonical article URL`);

    if (on.badge) ok('published: the card carries a badge');
    else bad('published: no badge on the featured card');

    /* The accessible name has to describe the DESTINATION and stay in step with
       the visible badge, which now reads "PREVIEW" — pinning the old
       product name here would mean a screen reader and the badge saying two
       different things about the same link. */
    if (on.aria && /breakdown/i.test(on.aria) && /analysis/i.test(on.aria)) {
      ok('published: the link has an accessible name that matches the badge');
    } else bad('published: featured card has no descriptive aria-label (got: ' + on.aria + ')');

    if (off.featured === false && off.badge === false) ok('no Game File: no card is featured');
    else bad('no Game File: a card was featured anyway');

    if (off.matchupLinks === 0) ok('no Game File: no card links into /matchups/ (no dead link)');
    else bad('no Game File: a ticker card points at /matchups/ with nothing published');

    if (on.tickerH === off.tickerH) ok(`layout: ticker height unchanged (${on.tickerH}px)`);
    else bad(`layout: ticker height moved ${off.tickerH} -> ${on.tickerH}`);

    if (on.geometry === off.geometry) ok('layout: every card keeps its exact x and width');
    else bad('layout: featuring a card MOVED other games\n' +
             '        without: ' + off.geometry + '\n        with:    ' + on.geometry);

    /* ---- reduced motion ----------------------------------------------- */
    page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.route('**/api/nav/mlb-slate*', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLATE) }));
    await page.route('**/api/matchups/today', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FEATURED) }));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    const rm = await page.evaluate(() => {
      const gf = document.querySelector('.ticker .gm--gf');
      return gf ? { anim: getComputedStyle(gf).animationName, featured: true } : { featured: false };
    });
    await page.close();

    if (rm.featured && rm.anim === 'none') ok('reduced motion: styling kept, pulse disabled');
    else if (!rm.featured) bad('reduced motion: the card lost its featured styling entirely');
    else bad(`reduced motion: animation still running (${rm.anim})`);


    /* The bug that actually shipped. On production the ticker is server-rendered
       by the tmr-home-ssr Worker, so renderTicker() never runs and the slate
       payload it captures is never set. Matching depended on that payload, so
       the feature worked locally and did nothing live. The browser cases above
       all exercise the JS-rendered path and cannot see it, so this asserts the
       fallback exists at the source level. */
    {
      const src = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');
      const fn = src.slice(src.indexOf('function applyGameFile'));
      const body = fn.slice(0, fn.indexOf('var pk = gameFilePk'));
      if (/if \(!lastSlate\)/.test(body) && /nav\/mlb-slate/.test(body))
        ok('SSR path: applyGameFile fetches the slate when the strip was not rendered by this script');
      else
        bad('SSR path: applyGameFile depends on renderTicker having run - it will no-op on production');
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\nticker Game File feature: link, badge, silence when unpublished, zero layout cost');
  if (failures) { console.error(`\n${failures} failing`); process.exit(1); }
})();
