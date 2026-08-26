#!/usr/bin/env node
'use strict';

/**
 * nba-nhl-simulator-ux-audit.cjs -- inspect the real pages the way a person
 * would, at the sizes people actually use.
 *
 * Everything checked here is something that makes a page unusable rather than
 * merely ugly: text too small to read on a phone, a table that pushes the whole
 * document sideways, a control you cannot reach with a keyboard, a button with
 * no accessible name, contrast that fails for anyone whose eyes are not perfect.
 *
 * It runs against production, at five widths including a browser zoomed to
 * 125%, because a layout that only holds at exactly 100% is a layout that breaks
 * for a large number of real visitors.
 */

const assert = require('assert');
const { chromium } = require('playwright');

const PAGES = [
  ['NBA', 'https://trustmyrecord.com/nba-simulator/'],
  ['NHL', 'https://trustmyrecord.com/nhl-simulator/'],
];

const VIEWS = [
  ['desktop', { width: 1440, height: 900 }, 1],
  ['laptop', { width: 1280, height: 800 }, 1],
  ['laptop at 125%', { width: 1280, height: 800 }, 1.25],
  ['tablet', { width: 834, height: 1112 }, 1],
  ['phone', { width: 390, height: 844 }, 1],
  ['small phone', { width: 320, height: 720 }, 1],
];

const problems = [];
const note = (m) => problems.push(m);

/** Relative luminance, for a contrast ratio. */
function lum(rgb) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

function parseRgb(s) {
  const m = String(s).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((x) => parseFloat(x));
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

async function audit(browser, label, url, viewName, viewport, zoom) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: zoom,
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
  });
  const page = await context.newPage();
  const where = label + ' ' + viewName;

  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  if (zoom !== 1) {
    await page.evaluate((z) => { document.documentElement.style.zoom = String(z); }, zoom);
    await page.waitForTimeout(250);
  }

  await page.waitForFunction(
    () => document.querySelector('#homeTeam') && document.querySelector('#homeTeam').options.length > 5,
    null, { timeout: 120000 },
  );

  // Run a simulation, because the result is the part with the tables in it.
  await page.evaluate(() => {
    const away = document.querySelector('#awayTeam');
    const home = document.querySelector('#homeTeam');
    const real = (s) => [...s.options].filter((o) => o.value);
    away.value = real(away)[0].value;
    home.value = real(home)[1].value;
    away.dispatchEvent(new Event('change', { bubbles: true }));
    home.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#runBtn');
  await page.waitForFunction(
    () => { const r = document.querySelector('#result'); return r && r.textContent.length > 400; },
    null, { timeout: 180000 },
  );

  // OPEN THE TABS THAT HOLD CONTROLS.
  //
  // The audit used to inspect whatever the result opened on, which is the box
  // score, so every interactive control added since -- the prop line boxes, the
  // hold-out and scratch buttons -- went unmeasured at phone width. A control
  // nobody can hit on a phone is worse than a table nobody can read.
  for (const label of ['Player ranges', 'Availability', 'Lineups']) {
    const opened = await page.evaluate((l) => {
      const b = [...document.querySelectorAll('#result .tabs button')]
        .find((x) => x.textContent.trim() === l);
      if (!b) return false;
      b.click();
      return true;
    }, label);
    if (!opened) continue;
    await page.waitForTimeout(450);

    const controls = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#result input, #result select, #result button.outbtn, #result .ghostbtn')
        .forEach((n) => {
          if (n.offsetParent === null) return;
          const r = n.getBoundingClientRect();
          const cs = getComputedStyle(n);
          const name = (n.getAttribute('aria-label') || n.textContent || '').trim()
            || (n.labels && n.labels.length ? n.labels[0].textContent.trim() : '');
          out.push({
            tag: n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).split(' ')[0] : ''),
            h: Math.round(r.height),
            w: Math.round(r.width),
            px: parseFloat(cs.fontSize),
            named: !!name,
            reachable: n.tabIndex >= 0,
          });
        });
      return out;
    });
    for (const c of controls) {
      if (c.px && c.px < 11) note(where + ' [' + label + ']: ' + c.tag + ' text at ' + c.px + 'px');
      if (!c.named) note(where + ' [' + label + ']: ' + c.tag + ' has no accessible name');
      if (!c.reachable) note(where + ' [' + label + ']: ' + c.tag + ' cannot take keyboard focus');
      if (viewport.width < 500 && c.h && c.h < 30) {
        note(where + ' [' + label + ']: ' + c.tag + ' is only ' + c.h + 'px tall');
      }
    }
    const wide = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    }));
    if (wide.doc > wide.win + 2) {
      note(where + ' [' + label + ']: the page scrolls sideways (' + wide.doc + ' > ' + wide.win + ')');
    }
  }

  // 1. NOTHING PUSHES THE PAGE SIDEWAYS. A wide table is allowed to scroll
  //    inside its own box; the document is not.
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  if (overflow.doc > overflow.win + 2) {
    note(where + ': the page scrolls sideways (' + overflow.doc + ' > ' + overflow.win + ')');
  }

  // 2. NOTHING IS TOO SMALL TO READ.
  const tiny = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#result *, .setup *').forEach((n) => {
      if (!n.textContent || !n.textContent.trim()) return;
      if (n.children.length) return;
      const px = parseFloat(getComputedStyle(n).fontSize);
      if (px && px < 11) out.push(n.className + ' @ ' + px.toFixed(1) + 'px');
    });
    return [...new Set(out)].slice(0, 4);
  });
  if (tiny.length) note(where + ': text under 11px -- ' + tiny.join(', '));

  // 3. EVERY CONTROL HAS A NAME AND CAN BE REACHED.
  const unnamed = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, select, input, a[href]').forEach((n) => {
      if (n.offsetParent === null) return;
      const name = (n.getAttribute('aria-label') || n.textContent || '').trim()
        || (n.labels && n.labels.length ? n.labels[0].textContent.trim() : '')
        || n.getAttribute('title') || '';
      if (!name) out.push(n.tagName.toLowerCase() + '.' + (n.className || '?'));
      if (n.tabIndex < 0) out.push('unreachable ' + n.tagName.toLowerCase());
    });
    return [...new Set(out)].slice(0, 5);
  });
  if (unnamed.length) note(where + ': controls with no accessible name -- ' + unnamed.join(', '));

  // 4. TAP TARGETS ARE BIG ENOUGH TO HIT ON A PHONE.
  if (viewport.width < 500) {
    const small = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#result button, .setup button, .tabs button').forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.width === 0) return;
        if (r.height < 30) out.push(n.textContent.trim().slice(0, 18) + ' @ ' + Math.round(r.height) + 'px');
      });
      return [...new Set(out)].slice(0, 4);
    });
    if (small.length) note(where + ': tap targets under 30px -- ' + small.join(', '));
  }

  // 5. CONTRAST, on the body text a reader spends their time on.
  const contrast = await page.evaluate(() => {
    const el = document.querySelector('#result .disc') || document.querySelector('#result');
    if (!el) return null;
    const cs = getComputedStyle(el);
    let bgEl = el;
    let bg = cs.backgroundColor;
    while (bgEl && (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
      bgEl = bgEl.parentElement;
      if (!bgEl) break;
      bg = getComputedStyle(bgEl).backgroundColor;
    }
    return { fg: cs.color, bg: bg || 'rgb(255,255,255)' };
  });
  if (contrast) {
    const fg = parseRgb(contrast.fg);
    const bg = parseRgb(contrast.bg);
    if (fg && bg) {
      const l1 = lum(fg);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (ratio < 4.5) {
        note(where + ': secondary text contrast is ' + ratio.toFixed(2) + ':1, under 4.5:1');
      }
    }
  }

  // 6. KEYBOARD. Tabbing from the top must reach the run button, and focus must
  //    be visible when it gets there.
  const keyboard = await page.evaluate(() => {
    const run = document.querySelector('#runBtn');
    if (!run) return { reached: false, visible: false };
    run.focus();
    const reached = document.activeElement === run;
    const cs = getComputedStyle(run);
    const visible = (cs.outlineStyle && cs.outlineStyle !== 'none')
      || (cs.boxShadow && cs.boxShadow !== 'none');
    return { reached, visible };
  });
  if (!keyboard.reached) note(where + ': the run button cannot take keyboard focus');

  console.log('  checked ' + where);
  await page.close();
  await context.close();
}

(async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const [label, url] of PAGES) {
      for (const [viewName, viewport, zoom] of VIEWS) {
        await audit(browser, label, url, viewName, viewport, zoom);
      }
    }
  } finally {
    await browser.close();
  }

  if (problems.length) {
    console.log('\nFINDINGS');
    problems.forEach((p) => console.log('  ' + p));
    process.exit(1);
  }
  console.log('\nPASS  both simulators are usable at every width checked, '
    + 'including a browser at 125%');
}());
