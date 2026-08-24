#!/usr/bin/env node
/**
 * POSTGAME TICKER — browser proof (Nima, 2026-08-23).
 *
 * Proves, in a real Chromium tab against tests/fixtures/nav-mlb-slate-postgame.json
 * (pregame/live cards taken from the existing insight-strip fixture, FINAL cards
 * built from a real day's MLB Stats API record via
 * tests/fixtures/build-postgame-slate-fixture.cjs):
 *
 *   1. A FINAL card switches into postgame mode: data-mode="postgame" on its
 *      .gm-in strip, and the probable-pitcher line is gone (the real decisions
 *      line replaces it).
 *   2. A LIVE/UPCOMING card is untouched: still data-mode="pregame".
 *   3. Every FINAL card carries 5-6 rotating items, and the first line visible
 *      is the pitching decision (WP/LP/SV).
 *   4. Each FINAL card's own dwell (data-dwell) falls inside the 10-20s band
 *      Nima asked for.
 *   5. The rotation actually advances: fast-forwarding the page clock past a
 *      card's dwell flips its visible line to the next one in its own list.
 *   6. Two different FINAL games show two different sets of categories - the
 *      rotation is not the same canned template repeated.
 *   7. Nothing clips: the strip box does not grow, and no line's text overflows
 *      the box it was given.
 *
 *   node tests/postgame-ticker-browser-proof.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TMR_POSTGAME_PROOF_PORT || 4194);
const FIXTURE = path.join(__dirname, 'fixtures', 'nav-mlb-slate-postgame.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

const failures = [];
function check(ok, message) {
  if (!ok) failures.push(message);
  return ok;
}

function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel.replace(/^\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

function readCards(page) {
  return page.evaluate(() => {
    const round = (n) => Math.round(n * 100) / 100;
    return [...document.querySelectorAll('.ticker .gm')]
      .filter((c) => !c.classList.contains('is-skel') && !c.classList.contains('is-msg') && !c.classList.contains('gm--nfl'))
      .map((c) => {
        const strip = c.querySelector('.gm-in');
        const lines = [...c.querySelectorAll('.gm-in-l')];
        const on = lines.filter((l) => l.classList.contains('is-on'));
        const rect = c.getBoundingClientRect();
        const stripRect = strip ? strip.getBoundingClientRect() : null;
        return {
          teams: [...c.querySelectorAll('.gm-top .t')].map((t) => t.textContent.trim()).join(' @ '),
          status: c.querySelector('.st') ? c.querySelector('.st').className : '',
          hasPitcherLine: !!c.querySelector('.gm-sp'),
          mode: strip ? strip.getAttribute('data-mode') : null,
          dwell: strip ? parseInt(strip.getAttribute('data-dwell'), 10) : null,
          lineCount: lines.length,
          onIndex: lines.indexOf(on[0]),
          onText: on[0] ? (on[0].querySelector('b') || {}).textContent.trim() : null,
          onCategory: on[0] ? on[0].getAttribute('data-cat') : null,
          allCategories: lines.map((l) => l.getAttribute('data-cat')),
          allTexts: lines.map((l) => (l.querySelector('b') || {}).textContent.trim()),
          cardH: round(rect.height),
          clipped: on[0] && on[0].querySelector('b')
            ? on[0].querySelector('b').scrollHeight > on[0].querySelector('b').clientHeight + 1 : false
        };
      });
  });
}

(async () => {
  const slate = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const server = await serve();
  const browser = await chromium.launch();
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/api/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ ok: true })
  }));
  await context.route('**/api/nav/mlb-slate*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(slate)
  }));
  await context.clock.install({ time: new Date(`${slate.slate_date}T21:00:00-07:00`) });

  const page = await context.newPage();
  page.on('pageerror', (err) => failures.push(`page error: ${err.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('.ticker .gm:not(.is-skel):not(.is-msg)', { timeout: 15000 });
  await page.waitForTimeout(600);

  const cards = await readCards(page);
  const finals = cards.filter((c) => /is-final/.test(c.status));
  const nonFinals = cards.filter((c) => !/is-final/.test(c.status));

  check(finals.length >= 4, `expected several FINAL cards in the fixture, got ${finals.length}`);
  check(nonFinals.length >= 1, `expected at least one pregame/live card in the fixture, got ${nonFinals.length}`);

  finals.forEach((c) => {
    check(c.mode === 'postgame', `${c.teams}: expected postgame mode, got ${c.mode}`);
    check(!c.hasPitcherLine, `${c.teams}: probable-pitcher line should be gone once FINAL`);
    check(c.lineCount >= 5 && c.lineCount <= 6, `${c.teams}: expected 5-6 rotating items, got ${c.lineCount}`);
    check(c.onIndex === 0, `${c.teams}: the first visible line should be index 0 on first paint`);
    check(c.onCategory === 'decisions', `${c.teams}: first line should be the pitching decision, got ${c.onCategory}`);
    check(/^WP: /.test(c.onText) || /^LP: /.test(c.onText),
      `${c.teams}: decisions line should read "WP: ... / LP: ... [/ SV: ...]", got "${c.onText}"`);
    check(c.dwell >= 10000 && c.dwell <= 20000,
      `${c.teams}: dwell ${c.dwell}ms is outside the 10-20s band Nima asked for`);
    check(!c.clipped, `${c.teams}: the visible line's text is clipped inside its box`);
    check(new Set(c.allCategories).size === c.allCategories.length,
      `${c.teams}: a category repeats on one card: ${c.allCategories.join(',')}`);
  });

  nonFinals.forEach((c) => {
    check(c.mode === null || c.mode === 'pregame',
      `${c.teams}: a non-final card should not be in postgame mode`);
  });

  /* Different games, different stories: two FINAL cards' category sets must not
     be identical, which is the "not the same canned template" requirement. */
  if (finals.length >= 2) {
    const sets = finals.map((c) => c.allCategories.join(','));
    check(new Set(sets).size > 1,
      'every FINAL card rotated the exact same category sequence - that is the canned-template failure mode');
  }

  /* Rotation actually advances. clock.fastForward() only fires ONE pending
     timer at the jump target - it is built for skipping gaps, not for
     replaying a repeating interval. clock.runFor() actually steps through
     time, firing the 1s rotation heartbeat on every tick in between, which is
     what a real ~15-20s wait looks like to the page. */
  const target = finals[0];
  if (target) {
    /* The countdown for a given strip is only SEEDED on the rotation timer's
       first 1s tick, with a per-card offset of up to 4 extra ticks (so eight
       cards on a row do not all flip in the same frame) - so the real elapsed
       time to the first advance can run dwell + ~5s past the raw dwell value. */
    await context.clock.runFor(target.dwell + 6000);
    await page.waitForTimeout(50);
    const after = await readCards(page);
    const same = after.find((c) => c.teams === target.teams);
    check(!!same, `card for ${target.teams} still present after the clock advance`);
    if (same) {
      check(same.onIndex === 1,
        `${target.teams}: expected the rotation to have advanced to line 1 after ${target.dwell}ms, still on ${same.onIndex}`);
      check(same.cardH === target.cardH,
        `${target.teams}: card height changed while rotating (${target.cardH} -> ${same.cardH}) - the strip must not reflow the card`);
    }
  } else {
    failures.push('no FINAL card found to test rotation against');
  }

  await browser.close();
  server.close();

  console.log(`\n${cards.length} cards read (${finals.length} FINAL, ${nonFinals.length} pregame/live).`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nAll postgame ticker checks passed.');
})().catch((e) => { console.error(e); process.exit(1); });
