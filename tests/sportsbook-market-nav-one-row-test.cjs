/**
 * MARKET_NAV_ONE_ROW_20260831
 *
 * Locks the sportsbook market / period tab strip to a single row for every
 * sport in PERIOD_CATALOGS at every desktop / laptop width, including the
 * CSS widths a 125% browser zoom produces.
 *
 * Asserts, per sport per width:
 *   - every visible tab shares one offsetTop  (never a second row)
 *   - the strip never scrolls vertically       (never a clipped second row)
 *   - no visible tab is clipped by the strip's right edge
 *   - visible tabs + tabs folded into MORE == the full catalog (nothing lost)
 *   - when MORE is present at least MIN_VISIBLE tabs stay on the row
 *   - the active tab keeps its highlight, on the row or via the MORE pill
 *
 * Run:  TMR_STATIC_PORT=5731 node tests/sportsbook-market-nav-one-row-test.cjs
 */
const { chromium } = require(require('path').join(process.env.TMR_PW_ROOT || 'C:/Users/BL/tmrfe4', 'node_modules/@playwright/test'));

const PORT = Number(process.env.TMR_STATIC_PORT || 5731);
const URL = `http://localhost:${PORT}/sportsbook/`;

// Every board the component serves. NBASummer is Summer League.
const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'WNBA', 'NPB',
  'NBASummer', 'Soccer', 'Tennis', 'UFC', 'PFL', 'MMA', 'Boxing', 'Golf',
  'NASCAR', 'F1'];

// CSS widths. A browser at 125% zoom reports width/1.25 CSS px, so the
// second number of each pair is that same monitor at 125%.
const WIDTHS = [
  1920, 1536,   // 1920 @100% / @125%
  1728, 1382,   // 1728 (16" MBP)
  1600, 1280,
  1512, 1210,   // 1512 (14" MBP)
  1440, 1152,
  1366, 1093,   // the classic laptop, and it at 125%
  1280, 1024,
  1180, 900, 820, 768, 640, 480, 390,
];

const fail = [];
function check(cond, msg) { if (!cond) fail.push(msg); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // The board lives in a tab pane that can start hidden; force it visible so
  // the strip has a real width to measure.
  await page.evaluate(() => {
    const p = document.getElementById('picks');
    if (p) { p.classList.add('active'); p.style.display = 'block'; }
  });
  await page.waitForFunction(() => window.TMR && typeof window.TMR._renderMarketNavProbe === 'function'
    || (window.TMR && window.TMR._renderPeriodBar && window.TMR.initMarketNav), null, { timeout: 15000 });
  await page.waitForTimeout(400);

  const results = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const sport of SPORTS) {
      const r = await page.evaluate(async (sport) => {
        const bar = document.getElementById('lobbyPeriodBar');
        let expected = [];
        // The page's own board code can re-render the strip underneath us
        // (default-board boot, a board fetch settling). Retry until the strip
        // we measure is the one we asked for.
        for (let attempt = 0; attempt < 4; attempt++) {
          window.TMR.selectedSport = sport;
          window.TMR._renderPeriodBar(sport);
          expected = Array.from(bar.querySelectorAll('.sportsbook-period-tab')).map(t => t.textContent.trim());
          await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
          await new Promise(res => setTimeout(res, 80));
          await new Promise(res => requestAnimationFrame(res));
          const menuNow = document.querySelector('.tmr-mktnav-menu');
          const seen = Array.from(bar.querySelectorAll('.sportsbook-period-tab'))
            .concat(menuNow ? Array.from(menuNow.querySelectorAll('.sportsbook-period-tab')) : [])
            .map(t => t.textContent.trim()).sort().join('|');
          if (seen === expected.slice().sort().join('|')) break;
        }

        const cs = getComputedStyle(bar);
        const br = bar.getBoundingClientRect();
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const more = bar.querySelector('.tmr-mktnav-more');
        const menu = document.querySelector('.tmr-mktnav-menu');
        const onRow = Array.from(bar.querySelectorAll('.sportsbook-period-tab'));
        const folded = menu ? Array.from(menu.querySelectorAll('.sportsbook-period-tab')) : [];
        const tops = onRow.map(t => Math.round(t.getBoundingClientRect().top));
        const heights = onRow.map(t => Math.round(t.getBoundingClientRect().height));
        const last = onRow.length ? onRow[onRow.length - 1].getBoundingClientRect() : null;
        const moreR = (more && !more.hidden) ? more.getBoundingClientRect() : null;
        const rightMost = Math.max(last ? last.right : 0, moreR ? moreR.right : 0);
        const active = Array.from(document.querySelectorAll('.sportsbook-period-tab'))
          .filter(t => t.classList.contains('is-active'));
        return {
          flexWrap: cs.flexWrap,
          barH: Math.round(br.height),
          scrollH: bar.scrollHeight,
          clientH: bar.clientHeight,
          contentRight: br.right - padR,
          rightMost,
          onRow: onRow.map(t => t.textContent.trim()),
          folded: folded.map(t => t.textContent.trim()),
          moreShown: !!moreR,
          scrollMode: bar.classList.contains('is-scroll'),
          scrollW: bar.scrollWidth,
          clientW: bar.clientWidth,
          distinctTops: Array.from(new Set(tops)).length,
          distinctHeights: Array.from(new Set(heights)).length,
          activeCount: active.length,
          activeFolded: active.some(t => menu && menu.contains(t)),
          morePill: !!(more && more.classList.contains('is-active')),
          expected: expected,
        };
      }, sport);

      const tag = `${sport}@${width}`;
      const total = r.onRow.length + r.folded.length;
      check(r.flexWrap === 'nowrap', `${tag}: flex-wrap is ${r.flexWrap}, expected nowrap`);
      check(r.distinctTops <= 1, `${tag}: tabs on ${r.distinctTops} rows`);
      check(r.scrollH <= r.clientH + 1, `${tag}: strip scrolls vertically (${r.scrollH} > ${r.clientH})`);
      check(r.distinctHeights <= 1, `${tag}: ${r.distinctHeights} different tab heights`);
      if (!r.scrollMode) {
        check(r.rightMost <= r.contentRight + 1.5,
          `${tag}: row overflows right edge by ${(r.rightMost - r.contentRight).toFixed(1)}px`);
        check(r.scrollW <= r.clientW + 1, `${tag}: horizontal overflow without scroll mode`);
      }
      if (r.moreShown) {
        check(r.folded.length > 0, `${tag}: MORE shown but nothing folded`);
        check(r.onRow.length >= 3, `${tag}: only ${r.onRow.length} tabs left beside MORE`);
      } else if (!r.scrollMode) {
        check(r.folded.length === 0, `${tag}: tabs folded with no MORE trigger`);
      }
      check(r.onRow.concat(r.folded).sort().join('|') === r.expected.slice().sort().join('|'),
        `${tag}: market set changed by folding -> ` + r.onRow.concat(r.folded).join(',') + ' vs ' + r.expected.join(','));
      if (r.activeCount) {
        check(!r.activeFolded || r.morePill, `${tag}: active tab folded but MORE not highlighted`);
      }
      results.push({ tag, total, onRow: r.onRow.length, folded: r.folded.length,
        more: r.moreShown, scroll: r.scrollMode, catalog: r.onRow.concat(r.folded).join(' | ') });
    }
  }

  check(errs.length === 0, `page errors: ${errs.join(' ; ')}`);

  // Compact report: widest, a laptop, a laptop at 125%, and a phone.
  for (const w of [1920, 1440, 1366, 1093, 820, 390]) {
    const rows = results.filter(r => r.tag.endsWith('@' + w));
    const mode = rows.map(r => r.scroll ? 'S' : (r.more ? `M${r.folded}` : '1'));
    console.log(`w=${String(w).padEnd(5)} ` + rows.map((r, i) => r.tag.split('@')[0] + ':' + mode[i]).join(' '));
  }
  console.log(`\n${results.length} sport x width combinations checked (${SPORTS.length} sports x ${WIDTHS.length} widths).`);
  const nfl1440 = results.find(r => r.tag === 'NFL@1440');
  console.log('NFL@1440 row:', nfl1440.catalog, nfl1440.more ? '(+MORE)' : '');

  await browser.close();
  if (fail.length) {
    console.error('\nFAIL (' + fail.length + '):');
    fail.slice(0, 40).forEach(f => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('\nPASS - one clean row, no orphan tabs, at every sport and width.');
})();
