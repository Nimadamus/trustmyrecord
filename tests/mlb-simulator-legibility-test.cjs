#!/usr/bin/env node

/**
 * MLB SIMULATOR - RESULT LEGIBILITY GUARD   LIGHT_SURFACE_20260831
 * =============================================================================
 * The bug this locks: tmr-theme-a.css paints the whole site's ink a pale blue
 * for the dark shell, using blanket element rules (`table td`, `th`, `p`, `li`,
 * `small`). Inside the simulator's WHITE cards - the line score, the batting and
 * pitching tables, the lineup/roster source bars - that same ink landed at
 * 1.25:1 to 1.49:1. Every number was in the DOM and none of it was readable.
 *
 * Screenshots proved the fix once. This proves it on every run, and it is the
 * same check against localhost or against production:
 *
 *   node tests/mlb-simulator-legibility-test.cjs
 *   node tests/mlb-simulator-legibility-test.cjs --site https://trustmyrecord.com
 *
 * Method. For each text node inside the result components it walks the ancestor
 * chain compositing background-color over background-color until it reaches an
 * opaque one, then computes the WCAG contrast ratio. Where a gradient or a
 * background image intervenes the true painted colour is not derivable from the
 * CSSOM, so that element is reported as indeterminate and skipped rather than
 * guessed - a guessed pass is worse than no check. The white cards this test
 * targets are solid-filled, so the coverage assertion below still bites.
 *
 * Threshold is WCAG AA for body text (4.5:1). Large/bold display text would be
 * allowed 3:1, but everything here is small tabular data, so one bar applies.
 */

const assert = require('assert');
const { chromium } = require('playwright');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const SITE = arg('--site', 'http://127.0.0.1:8899').replace(/\/$/, '');
const MIN = Number(arg('--min', '4.5'));

const PAGE_JS = () => {
  const parse = (s) => {
    const m = String(s || '').match(/[\d.]+/g);
    if (!m) return null;
    return [Number(m[0]), Number(m[1]), Number(m[2]), m.length > 3 ? Number(m[3]) : 1];
  };
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const lum = (c) => {
    const a = [0, 1, 2].map((i) => {
      const v = c[i] / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  };

  function ground(el) {
    let e = el;
    let acc = null;
    while (e) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { indeterminate: true };
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) {
        acc = acc ? over(acc, c) : c;
        if (acc[3] >= 0.999 || c[3] >= 0.999) return { rgb: acc.slice(0, 3) };
      }
      e = e.parentElement;
    }
    return { rgb: [255, 255, 255] };
  }

  const SCOPES = [
    ['line score', '.box-score-table td, .box-score-table th'],
    ['final score card', '#boxScoreMatchupCard *'],
    ['batting / pitching tables', '.player-box-table td, .player-box-table th'],
    ['source + notice bars', '.player-source-note, .box-score-honesty, .box-score-disclaimer, .lineup-freshness-note'],
    ['section headers', '.player-box-score-content > h4'],
    ['export buttons', '#copyBoxScoreButton, #saveBoxScoreButton'],
    ['play by play', '.pbp-text, .pbp-meta, .pbp-score, .pbp-half-label'],
  ];

  const out = [];
  SCOPES.forEach(([scope, sel]) => {
    document.querySelectorAll(sel).forEach((el) => {
      const txt = (el.textContent || '').trim();
      if (!txt) return;
      if (el.children.length && !el.matches('button')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const fg = parse(cs.color);
      if (!fg) return;
      const g = ground(el);
      if (g.indeterminate) { out.push({ scope, txt: txt.slice(0, 24), indeterminate: true }); return; }
      const f = fg[3] < 1 ? over(fg, g.rgb.concat(1)) : fg;
      const l1 = lum(f);
      const l2 = lum(g.rgb);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      out.push({
        scope,
        txt: txt.slice(0, 24),
        fg: cs.color,
        bg: 'rgb(' + g.rgb.map(Math.round).join(',') + ')',
        size: cs.fontSize,
        ratio: Math.round(ratio * 100) / 100,
      });
    });
  });
  return out;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

  await page.goto(SITE + '/mlb-simulator/', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(6000);

  // The run gate intercepts the button for logged-out visitors; its documented
  // kill switch is used here so the test never needs a session.
  await page.evaluate(() => {
    window.SIM_GATE_FLAGS = window.SIM_GATE_FLAGS || {};
    window.SIM_GATE_FLAGS.gate = false;
    window.SIM_GATE_FLAGS.autoSave = false;
  });

  const opts = await page.$eval('#awayTeamSelect', (e) => e.options.length);
  assert.ok(opts > 2, 'team selectors populated (' + opts + ' options)');
  await page.selectOption('#awayTeamSelect', { index: 1 });
  await page.selectOption('#homeTeamSelect', { index: 2 });
  await page.waitForTimeout(2500);
  await page.click('#runSimulationButton');

  await page.waitForFunction(
    () => document.querySelector('#boxScorePanel')
      && document.querySelector('#boxScorePanel').dataset.boxScoreState === 'projected',
    null, { timeout: 120000 },
  );
  await page.waitForTimeout(1500);

  const rows = await page.evaluate(PAGE_JS);
  const measured = rows.filter((r) => !r.indeterminate);
  const skipped = rows.filter((r) => r.indeterminate);
  const failures = measured.filter((r) => r.ratio < MIN);

  const byScope = {};
  measured.forEach((r) => {
    if (!byScope[r.scope] || r.ratio < byScope[r.scope].ratio) byScope[r.scope] = r;
  });

  console.log('site: ' + SITE);
  Object.keys(byScope).sort().forEach((s) => {
    const w = byScope[s];
    console.log('  ' + s.padEnd(26) + ' worst ' + String(w.ratio).padStart(6)
      + ':1  ' + w.fg + ' on ' + w.bg + '  "' + w.txt + '"');
  });
  console.log('  measured ' + measured.length + ' text nodes, ' + skipped.length + ' indeterminate (gradient ground)');

  if (failures.length) {
    failures.slice(0, 15).forEach((f) => {
      console.error('  FAIL ' + f.ratio + ':1  ' + f.fg + ' on ' + f.bg
        + '  [' + f.scope + '] "' + f.txt + '"');
    });
  }
  assert.strictEqual(failures.length, 0,
    failures.length + ' text node(s) below ' + MIN + ':1 inside the simulator result components');

  // Coverage: an empty or barely-populated sample would pass vacuously.
  const need = ['line score', 'batting / pitching tables', 'source + notice bars'];
  need.forEach((s) => {
    const n = measured.filter((r) => r.scope === s).length;
    assert.ok(n > 0, 'measured at least one node in "' + s + '" (got ' + n + ')');
  });
  assert.ok(measured.length >= 150,
    'sampled the full result surface (' + measured.length + ' nodes)');

  const ours = errors.filter((e) => !/espn|favicon|fonts\.|analytics|onrender|net::ERR|403|Failed to load resource/i.test(e));
  assert.strictEqual(ours.length, 0, 'no page errors: ' + ours.slice(0, 3).join(' | '));

  await browser.close();
  console.log('mlb-simulator-legibility-test: ok');
})().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
