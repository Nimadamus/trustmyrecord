#!/usr/bin/env node
'use strict';

/**
 * nba-nhl-simulator-integrity-test.cjs -- the promises the page makes about
 * itself, checked in production.
 *
 * Three of them, and each has a way of quietly becoming false:
 *
 *   A SHARED LINK MUST REPRODUCE. The page offers "Copy link to this
 *   simulation". If the link comes back with a different game, it was never a
 *   link to a simulation, it was a link to a page that runs a new one.
 *
 *   A PRINTED PAGE MUST BE A REPORT. Controls that do nothing on paper are
 *   noise, and a dark background is a wasted cartridge.
 *
 *   THE PAGE MUST SAY HOW OLD ITS DATA IS. A simulator quoting last season's
 *   roster without saying so is worse than one that refuses to answer.
 *
 * Run with --production to check the deployed site; otherwise the API host is
 * taken from --host.
 */

const assert = require('assert');
const { chromium } = require('playwright');

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i !== -1 ? process.argv[i + 1] : d;
};
const SITE = arg('--site', 'https://trustmyrecord.com');
const API = arg('--host', 'https://trustmyrecord-api.onrender.com');

async function json(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}

/* ------------------------------------------------------------------- api ---- */

async function reproducibility(sport) {
  const teams = await json(API + '/api/' + sport + '/public/teams');
  const list = teams.teams || teams;
  const away = list[0].ref;
  const home = list[1].ref;
  const base = API + '/api/' + sport + '/public/simulate?away=' + away + '&home=' + home + '&sims=1000';

  const first = await json(base);
  const seed = first.meta.seed;
  assert.ok(seed, sport + ' returned no seed, so no run can ever be shared');

  const again = await json(base + '&seed=' + seed);
  assert.deepStrictEqual(again.result.final, first.result.final,
    sport + ' the same seed produced a different final score');
  assert.deepStrictEqual(again.projection.win_probability, first.projection.win_probability,
    sport + ' the same seed produced a different win probability');

  // And a DIFFERENT seed must produce a different game, or "reproducible" only
  // means the engine ignores the seed.
  const other = await json(base + '&seed=' + ((seed % 2000000) + 12345));
  const differs = JSON.stringify(other.result.final) !== JSON.stringify(first.result.final)
    || JSON.stringify(other.result.box_score) !== JSON.stringify(first.result.box_score);
  assert.ok(differs, sport + ' a different seed produced an identical game');

  // FRESHNESS, stated rather than implied.
  const m = first.meta;
  assert.ok(m.data_built_at, sport + ' does not say when its data was built');
  assert.ok(m.data_freshness && m.data_freshness.status,
    sport + ' does not label how fresh its data is');
  assert.ok(m.data_source, sport + ' does not name its data source');
  assert.ok(['current', 'ageing', 'stale'].includes(m.data_freshness.status),
    sport + ' freshness status is ' + m.data_freshness.status);

  // HOLDOUT, published.
  const acc = await json(API + '/api/' + sport + '/public/accuracy');
  assert.ok(acc.holdout && acc.holdout.segments && acc.holdout.segments.length,
    sport + ' publishes no held-out result');
  const all = acc.holdout.segments[0];
  assert.ok(all.games > 1000, sport + ' holdout is only ' + all.games + ' games');
  assert.ok(Array.isArray(all.ci) && all.ci.length === 2,
    sport + ' holdout carries no interval');
  assert.ok(acc.holdout.holdout_seasons.every((s) => !acc.holdout.calibration_seasons.includes(s)),
    sport + ' holdout seasons overlap the calibration seasons');

  return {
    seed,
    freshness: m.data_freshness.status,
    holdout: all,
  };
}

/* --------------------------------------------------------------- browser ---- */

async function pageChecks(browser, sport, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(
    () => document.querySelector('#homeTeam') && document.querySelector('#homeTeam').options.length > 5,
    null, { timeout: 120000 },
  );
  await page.evaluate(() => {
    const a = document.querySelector('#awayTeam');
    const h = document.querySelector('#homeTeam');
    const real = (s) => [...s.options].filter((o) => o.value);
    a.value = real(a)[0].value;
    h.value = real(h)[1].value;
    a.dispatchEvent(new Event('change', { bubbles: true }));
    h.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.click('#runBtn');
  await page.waitForFunction(
    () => {
      const r = document.querySelector('#result');
      return r && r.textContent.length > 800;
    },
    null, { timeout: 180000 },
  );
  await page.waitForTimeout(1200);

  /* 1. THE SHARED LINK. Take the URL the page put in the address bar and load
        it fresh: it must bring back the same game, not a new one. */
  const shareUrl = page.url();
  assert.ok(/seed=/.test(shareUrl), sport + ' the page never pins a seed in its URL');
  // THE SCORE, from the score elements.
  //
  // Scraping the first "number dash number" out of the page text is how this
  // check quietly stopped checking anything: the provenance line says "Season
  // 2025-26" and that matched first, so two different games compared equal and
  // the assertion passed on a string that had nothing to do with either.
  const readFinal = () => document.querySelector('#result')
    && [...document.querySelectorAll('#result .mh .pts')].map((n) => n.textContent.trim()).join('-');
  const finalBefore = await page.evaluate(readFinal);
  assert.ok(/^\d+-\d+$/.test(finalBefore || ''),
    sport + ' could not read a final score off the page, got ' + finalBefore);

  const page2 = await ctx.newPage();
  await page2.goto(shareUrl, { waitUntil: 'networkidle', timeout: 120000 });
  await page2.waitForFunction(
    () => {
      const r = document.querySelector('#result');
      return r && r.textContent.length > 800;
    },
    null, { timeout: 180000 },
  );
  await page2.waitForTimeout(1000);
  const finalAfter = await page2.evaluate(readFinal);
  assert.strictEqual(finalAfter, finalBefore,
    sport + ' a shared link came back with a different game (' + finalBefore
    + ' vs ' + finalAfter + ')');
  // A check that cannot fail is not a check. Load the same link with the seed
  // changed: it must come back with a different game, or "reproduced" only
  // means the page ignored the seed.
  const otherUrl = shareUrl.replace(/seed=\d+/, 'seed=' + (Date.now() % 1900000 + 7));
  await page2.goto(otherUrl, { waitUntil: 'networkidle', timeout: 120000 });
  await page2.waitForFunction(
    () => {
      const r = document.querySelector('#result');
      return r && r.textContent.length > 800;
    },
    null, { timeout: 180000 },
  );
  await page2.waitForTimeout(1000);
  const finalOther = await page2.evaluate(readFinal);
  assert.notStrictEqual(finalOther, finalBefore,
    sport + ' a different seed returned the same game, so the seed does nothing');
  await page2.close();

  /* 2. THE PRINTED PAGE. Emulate print and check the controls are gone and the
        page is not printing a dark background. */
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);
  const printed = await page.evaluate(() => {
    // Whether the element has a layout box at all. Reading its own computed
    // display is not the question: a button inside a hidden panel still reports
    // display:block, because display is not inherited -- it just has nowhere to
    // be drawn. Boxes are the thing that reaches paper.
    const vis = (sel) => [...document.querySelectorAll(sel)]
      .filter((n) => n.getClientRects().length > 0
        && getComputedStyle(n).visibility !== 'hidden').length;
    return {
      runButton: vis('#runBtn'),
      segs: vis('#simSeg'),
      shareButtons: vis('#result .resultbar button'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      bodyColor: getComputedStyle(document.body).color,
      resultVisible: vis('#result table') > 0,
    };
  });
  assert.strictEqual(printed.runButton, 0, sport + ' prints the Run button');
  assert.strictEqual(printed.segs, 0, sport + ' prints the simulation-count control');
  assert.strictEqual(printed.shareButtons, 0, sport + ' prints the share and print buttons');
  assert.ok(printed.resultVisible, sport + ' prints no tables at all');
  const rgb = (printed.bodyBg.match(/\d+/g) || []).map(Number);
  if (rgb.length >= 3) {
    const light = (rgb[0] + rgb[1] + rgb[2]) / 3;
    assert.ok(light > 200,
      sport + ' prints on a dark background (' + printed.bodyBg + ')');
  }
  await page.emulateMedia({ media: 'screen' });

  /* 3. THE PAGE SAYS HOW OLD ITS DATA IS, in words, where a reader will see it. */
  const stated = await page.evaluate(() => {
    const t = document.body.textContent;
    return {
      age: /(hours?|days?|minutes?) old|updated|as of/i.test(t),
      source: /source|espn|nhl\.com|official/i.test(t),
    };
  });
  assert.ok(stated.age, sport + ' never says how old its data is');
  assert.ok(stated.source, sport + ' never names where its data comes from');

  await page.close();
  await ctx.close();
  return { shareUrl: shareUrl.slice(0, 90), final: finalBefore };
}

(async function main() {
  const out = {};
  for (const sport of ['nba', 'nhl']) {
    out[sport] = await reproducibility(sport);
    const h = out[sport].holdout;
    console.log('  ' + sport.toUpperCase() + ' api: seed reproduces, data ' + out[sport].freshness
      + ', holdout ' + h.games + ' games, skill ' + (h.brier_skill * 100).toFixed(2)
      + '% [' + (h.ci[0] * 100).toFixed(2) + ', ' + (h.ci[1] * 100).toFixed(2) + ']');
  }

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const [sport, path] of [['NBA', '/nba-simulator/'], ['NHL', '/nhl-simulator/']]) {
      const r = await pageChecks(browser, sport, SITE + path);
      console.log('  ' + sport + ' page: shared link reproduced ' + r.final
        + ', print strips the controls, data age and source stated');
    }
  } finally {
    await browser.close();
  }
  console.log('PASS  runs are reproducible from their link, print cleanly, '
    + 'and state their data age, source and held-out accuracy');
}());
