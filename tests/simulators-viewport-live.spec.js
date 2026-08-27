// Live viewport gate for all four simulators.
//
// Checks the things that actually break on a phone and are invisible on a
// desktop: the page scrolling sideways, text too small to read, wide tables with
// no scroll affordance, and controls too small to tap. Runs against production,
// so it measures what a visitor gets rather than a local build.
//
//   npx playwright test tests/simulators-viewport-live.spec.js
//
// The frozen NBA and NHL engines are not touched here. This only looks.

const { test, expect } = require('@playwright/test');

const SIMULATORS = [
  { sport: 'MLB', url: 'https://trustmyrecord.com/mlb-simulator/' },
  { sport: 'NBA', url: 'https://trustmyrecord.com/nba-simulator/' },
  { sport: 'NHL', url: 'https://trustmyrecord.com/nhl-simulator/' },
  { sport: 'NFL', url: 'https://trustmyrecord.com/nfl-simulator/' },
];

/**
 * The four sizes asked for. deviceScaleFactor stands in for the browser zoom
 * levels: a 125% zoom is a 1536-wide viewport on a 1920 screen, which is where
 * layouts fitted to exactly 1440 or 1536 start to clip.
 */
const VIEWPORTS = [
  { name: 'desktop 100%', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { name: 'desktop 125%', width: 1536, height: 864, deviceScaleFactor: 1.25 },
  { name: 'laptop', width: 1366, height: 768, deviceScaleFactor: 1 },
  { name: 'mobile 390px', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true },
];

for (const sim of SIMULATORS) {
  for (const vp of VIEWPORTS) {
    test(`${sim.sport} at ${vp.name}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.deviceScaleFactor,
        isMobile: !!vp.isMobile,
        hasTouch: !!vp.isMobile,
      });
      const page = await context.newPage();

      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', (e) => consoleErrors.push(String(e.message)));

      const response = await page.goto(sim.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      expect(response.status(), `${sim.sport} responds`).toBe(200);
      await page.waitForTimeout(2500);

      // 1. THE PAGE MUST NOT SCROLL SIDEWAYS. A few pixels of rounding is not a
      //    layout bug; a genuinely too-wide element is.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth - overflow.clientWidth,
        `${sim.sport} ${vp.name}: page scrolls sideways by `
        + (overflow.scrollWidth - overflow.clientWidth) + 'px',
      ).toBeLessThanOrEqual(2);

      // 2. Anything wider than the viewport must scroll INSIDE its own container,
      //    which is what makes a box score usable on a phone.
      const unscrollableWide = await page.evaluate(() => {
        const bad = [];
        for (const el of document.querySelectorAll('table, pre, .box-score, [class*="table"]')) {
          if (el.scrollWidth <= el.clientWidth + 2) continue;
          let node = el;
          let scrollable = false;
          for (let i = 0; i < 4 && node; i += 1) {
            const ov = getComputedStyle(node).overflowX;
            if (ov === 'auto' || ov === 'scroll') { scrollable = true; break; }
            node = node.parentElement;
          }
          if (!scrollable) {
            bad.push((el.tagName + '.' + (el.className || '')).slice(0, 60));
          }
        }
        return bad;
      });
      expect(unscrollableWide, `${sim.sport} ${vp.name}: wide content with no scroll affordance`)
        .toEqual([]);

      // 3. Readable text. Anything under 11px on a phone is a problem, and this
      //    ignores the empty and hidden nodes that would otherwise dominate.
      if (vp.isMobile) {
        const tiny = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('p, span, td, th, li, a, button, label')) {
            if (!el.textContent || !el.textContent.trim()) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const text = el.textContent.trim();
            // Readability is about text a visitor READS. A brand mark, a badge or
            // a superscript is legitimately small: the only sub-11px element on
            // these pages is the "TMR" wordmark in the link hub at 10px, which is
            // a logo and not a paragraph. Short strings and elements marked as
            // logos are exempt; anything with real words is not.
            const isMark = text.length <= 4
              || /mark|logo|badge|brand|sup|chip/i.test(el.className || '')
              || /mark|logo|badge|brand/i.test((el.parentElement || {}).className || '');
            if (isMark) continue;
            const size = parseFloat(getComputedStyle(el).fontSize);
            if (size && size < 11) out.push(text.slice(0, 30) + ' @' + size + 'px');
          }
          return out.slice(0, 5);
        });
        expect(tiny, `${sim.sport} mobile: text below 11px`).toEqual([]);
      }

      // 4. No console or page errors on load.
      const real = consoleErrors.filter((e) => !/favicon|third-party|net::ERR_/i.test(e));
      expect(real, `${sim.sport} ${vp.name}: console errors`).toEqual([]);

      await context.close();
    });
  }
}
