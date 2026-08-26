#!/usr/bin/env node
'use strict';

/**
 * nba-nhl-boxscore-browser-test.cjs -- the results experience, checked in the
 * browser rather than in the payload.
 *
 * The engine suites already prove the numbers reconcile. This proves the page
 * SHOWS them: that every section a reader is promised exists and has content in
 * it, that the box score on screen adds up to the score on screen, that the name
 * column survives a phone, and that printing produces a report rather than a
 * screenshot of a web page.
 *
 * Reading it off the rendered table is the point. A payload that reconciles and
 * a table that drops a column are the same thing to the person looking at it.
 *
 *   node tests/nba-nhl-boxscore-browser-test.cjs               (production)
 *   node tests/nba-nhl-boxscore-browser-test.cjs --site http://127.0.0.1:8080
 */

const assert = require('assert');
const { chromium } = require('playwright');

const arg = (f, d) => {
  const i = process.argv.indexOf(f);
  return i !== -1 ? process.argv[i + 1] : d;
};
const SITE = arg('--site', 'https://trustmyrecord.com');
const RUNS = Number(arg('--runs', 2));

const NBA_SECTIONS = ['Game summary', 'Full box score', 'Team stats', 'Scoring by quarter',
  'Game leaders', 'Important events', 'Player ranges', 'Simulation analysis'];
const NHL_SECTIONS = ['Game summary', 'Full box score', 'Team stats', 'Scoring summary',
  'Penalty summary', 'Skaters', 'Goaltenders', 'Three stars', 'Important events',
  'Player ranges', 'Simulation analysis'];

const NBA_COLS = ['MIN', 'PTS', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'OREB', 'DREB',
  'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', '+/-'];
const NHL_COLS = ['G', 'A', 'P', 'SOG', 'S%', 'PPG', 'SHG', '+/-', 'PIM', 'HIT', 'BLK',
  'GV', 'TK', 'FO', 'FO%', 'TOI'];
const NHL_GOALIE_COLS = ['DEC', 'TOI', 'SA', 'SV', 'GA', 'SV%', 'EN'];

async function openTab(page, label) {
  const ok = await page.evaluate((l) => {
    const b = [...document.querySelectorAll('#result .tabs button')]
      .find((x) => x.textContent.trim() === l);
    if (!b) return false;
    b.click();
    return true;
  }, label);
  await page.waitForTimeout(320);
  return ok;
}

const paneOf = (page) => page.evaluate(() => {
  const bar = document.querySelector('#result .tabs');
  const host = bar && bar.nextElementSibling ? bar.nextElementSibling : null;
  return host ? host.textContent.length : 0;
});

async function runSim(page) {
  await page.click('#runBtn');
  await page.waitForFunction(
    () => {
      const r = document.querySelector('#result');
      return r && r.textContent.length > 800;
    },
    null, { timeout: 180000 },
  );
  await page.waitForTimeout(1000);
}

async function check(browser, sport, url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(
    () => document.querySelector('#homeTeam') && document.querySelector('#homeTeam').options.length > 5,
    null, { timeout: 120000 },
  );

  for (let run = 0; run < RUNS; run += 1) {
    await page.evaluate((offset) => {
      const a = document.querySelector('#awayTeam');
      const h = document.querySelector('#homeTeam');
      const real = (s) => [...s.options].filter((o) => o.value);
      a.value = real(a)[offset % (real(a).length - 1)].value;
      h.value = real(h)[(offset + 3) % (real(h).length - 1)].value;
      a.dispatchEvent(new Event('change', { bubbles: true }));
      h.dispatchEvent(new Event('change', { bubbles: true }));
    }, run);
    await page.waitForTimeout(900);
    await runSim(page);

    /* 1. EVERY SECTION EXISTS AND HAS SOMETHING IN IT. */
    const wanted = sport === 'NBA' ? NBA_SECTIONS : NHL_SECTIONS;
    for (const label of wanted) {
      const found = await openTab(page, label);
      assert.ok(found, sport + ' has no "' + label + '" section');
      const chars = await paneOf(page);
      assert.ok(chars > 60,
        sport + ' section "' + label + '" rendered only ' + chars + ' characters');
    }

    /* 2. THE ACTIONS ARE THERE. */
    const actions = await page.evaluate(
      () => [...document.querySelectorAll('#result .actionbar button')].map((b) => b.textContent.trim()),
    );
    for (const a of ['Run again', 'Change matchup', 'Share result', 'Print box score']) {
      assert.ok(actions.includes(a), sport + ' has no "' + a + '" action, only: ' + actions.join(', '));
    }

    /* 3. THE BOX SCORE ON SCREEN ADDS UP TO THE SCORE ON SCREEN. */
    await openTab(page, 'Full box score');
    const box = await page.evaluate((cols) => {
      const host = document.querySelector('#result .tabs').nextElementSibling;
      const tables = [...host.querySelectorAll('table')];
      const read = (t) => {
        const heads = [...t.querySelectorAll('thead th')].map((h) => h.textContent.trim().replace(/[↑↓]/g, ''));
        const rows = [...t.querySelectorAll('tbody tr')];
        const body = rows.slice(0, -1).map((tr) => [...tr.children].map((td) => td.textContent.trim()));
        const total = rows.length ? [...rows[rows.length - 1].children].map((td) => td.textContent.trim()) : [];
        return { heads, body, total };
      };
      return {
        tables: tables.map(read),
        missing: cols.filter((c) => !tables.some(
          (t) => [...t.querySelectorAll('thead th')].some(
            (h) => h.textContent.trim().replace(/[↑↓]/g, '') === c),
        )),
        sticky: host.querySelectorAll('.tablewrap.sticky').length,
        sortable: host.querySelectorAll('th.sortable').length,
      };
    }, sport === 'NBA' ? NBA_COLS : NHL_COLS);

    assert.deepStrictEqual(box.missing, [],
      sport + ' box score is missing columns: ' + box.missing.join(', '));
    assert.ok(box.sticky >= 2, sport + ' box score tables are not sticky-named');
    assert.ok(box.sortable >= 10, sport + ' box score has only ' + box.sortable + ' sortable columns');

    // The two team tables carry a TEAM row; its scoring column must equal what
    // the players above it add to, read off the rendered cells.
    const scoreCol = sport === 'NBA' ? 'PTS' : 'G';
    let reconciled = 0;
    for (const t of box.tables) {
      const idx = t.heads.indexOf(scoreCol);
      if (idx < 0 || !t.total.length) continue;
      const players = t.body.reduce((sum, row) => sum + (parseFloat(row[idx]) || 0), 0);
      const team = parseFloat(t.total[idx]);
      if (!Number.isFinite(team)) continue;
      assert.strictEqual(players, team,
        sport + ' players add to ' + players + ' ' + scoreCol + ' against a team row of ' + team);
      reconciled += 1;
    }
    assert.ok(reconciled >= 2,
      sport + ' only reconciled ' + reconciled + ' team tables on screen');

    // NOTHING ON THE SHEET MAY BE A STRINGIFIED OBJECT.
    //
    // The team row printed "[object HTMLSpanElement]" on every box score on the
    // site, because the footer stringified whatever the player column returned
    // and that column returns an element. It is the sort of thing every
    // numerical check passes straight over.
    const junk = await page.evaluate(() => {
      const host = document.querySelector('#result .tabs').nextElementSibling;
      return /\[object |undefined|NaN|null/.test(host.textContent);
    });
    assert.ok(!junk, sport + ' box score contains a stringified object, NaN or undefined');

    /* 4. SORTING A COLUMN ACTUALLY REORDERS IT. */
    const sorted = await page.evaluate((col) => {
      const host = document.querySelector('#result .tabs').nextElementSibling;
      const t = host.querySelector('table');
      const heads = [...t.querySelectorAll('thead th')];
      const i = heads.findIndex((h) => h.textContent.trim().replace(/[↑↓]/g, '') === col);
      if (i < 0) return null;
      const read = () => [...t.querySelectorAll('tbody tr')].slice(0, -1)
        .map((tr) => parseFloat(tr.children[i].textContent) || 0);
      const before = read();
      heads[i].click();
      const after = read();
      const descending = after.every((v, k) => k === 0 || after[k - 1] >= v);
      return { before, after, descending };
    }, scoreCol);
    assert.ok(sorted, sport + ' could not find a sortable ' + scoreCol + ' column');
    assert.ok(sorted.descending,
      sport + ' sorting ' + scoreCol + ' did not order it: ' + sorted.after.join(','));
  }

  /* 4b. THE BROADCAST VIEW. Same game, different arrangement, and it has to be
         complete on its own terms: a scoreboard with both records, the final and
         how it was reached, the line by period, and the sections a box score
         has. Switching views must not change the game. */
  const beforeFinal = await page.evaluate(
    () => [...document.querySelectorAll('#result .mh .pts')].map((n) => n.textContent.trim()).join('-'),
  );
  const switched = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#result .viewtoggle button')]
      .find((x) => /Broadcast/.test(x.textContent));
    if (!b) return false;
    b.click();
    return true;
  });
  assert.ok(switched, sport + ' has no broadcast view control');
  await page.waitForTimeout(700);

  const bc = await page.evaluate(() => {
    const sb = document.querySelector('#result .sb');
    if (!sb) return null;
    const cells = [...sb.querySelectorAll('.sb-score')].map((n) => n.textContent.trim());
    return {
      scores: cells,
      records: [...sb.querySelectorAll('.sb-rec')].map((n) => n.textContent.trim()),
      status: (sb.querySelector('.sb-status') || {}).textContent,
      lineCols: [...sb.querySelectorAll('.sb-line thead th')].map((n) => n.textContent.trim()),
      lineRows: sb.querySelectorAll('.sb-line tbody tr').length,
      winnerMarked: sb.querySelectorAll('.sb-team.won').length,
      foot: (sb.querySelector('.sb-foot') || {}).textContent || '',
      sections: [...document.querySelectorAll('#result .tabs button')].map((b) => b.textContent.trim()),
      junk: /\[object |undefined|NaN/.test(sb.textContent),
    };
  });
  assert.ok(bc, sport + ' broadcast view rendered no scoreboard');
  assert.strictEqual(bc.scores.length, 2, sport + ' scoreboard shows ' + bc.scores.length + ' scores');
  assert.strictEqual(bc.records.length, 2,
    sport + ' scoreboard shows ' + bc.records.length + ' records');
  assert.ok(/^Final/.test(bc.status || ''), sport + ' scoreboard status reads "' + bc.status + '"');
  assert.strictEqual(bc.winnerMarked, 1, sport + ' scoreboard marks ' + bc.winnerMarked + ' winners');
  assert.ok(bc.lineRows === 2, sport + ' line score has ' + bc.lineRows + ' rows');
  assert.ok(bc.lineCols.length >= (sport === 'NBA' ? 6 : 5),
    sport + ' line score has only ' + bc.lineCols.join(',') );
  assert.ok(!bc.junk, sport + ' scoreboard contains a stringified object or NaN');
  assert.ok(/Source:/.test(bc.foot), sport + ' scoreboard does not state its data source');

  const wanted2 = sport === 'NBA'
    ? ['Game summary', 'Box score', 'Team stats', 'Scoring by quarter', 'Game leaders',
      'Important events', 'Simulation analysis']
    : ['Game summary', 'Box score', 'Team stats', 'Scoring summary', 'Penalty summary',
      'Goaltenders', 'Three stars', 'Important events', 'Simulation analysis'];
  for (const label of wanted2) {
    assert.ok(bc.sections.includes(label),
      sport + ' broadcast view has no "' + label + '" section, only: ' + bc.sections.join(', '));
  }

  // SWITCHING VIEWS MUST NOT CHANGE THE GAME.
  const afterFinal = await page.evaluate(() => {
    const sb = document.querySelector('#result .sb');
    return [...sb.querySelectorAll('.sb-score')].map((n) => n.textContent.trim()).join('-');
  });
  assert.strictEqual(afterFinal, beforeFinal,
    sport + ' switching to the broadcast view changed the score from '
    + beforeFinal + ' to ' + afterFinal);

  // Back to analysis for the checks that follow.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#result .viewtoggle button')]
      .find((x) => /TMR analysis/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(500);

  /* 5. THE PHONE. The name column must stay put while the rest scrolls, or
        every row becomes anonymous the moment a reader looks at a stat. */
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  const mob = await phone.newPage();
  await mob.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await mob.waitForFunction(
    () => document.querySelector('#homeTeam') && document.querySelector('#homeTeam').options.length > 5,
    null, { timeout: 120000 },
  );
  await mob.evaluate(() => {
    const a = document.querySelector('#awayTeam');
    const h = document.querySelector('#homeTeam');
    const real = (s) => [...s.options].filter((o) => o.value);
    a.value = real(a)[0].value;
    h.value = real(h)[1].value;
    a.dispatchEvent(new Event('change', { bubbles: true }));
    h.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await mob.waitForTimeout(900);
  await runSim(mob);
  await openTab(mob, 'Full box score');
  const mobile = await mob.evaluate(() => {
    const host = document.querySelector('#result .tabs').nextElementSibling;
    const wrap = host.querySelector('.tablewrap.sticky');
    if (!wrap) return { ok: false };
    const nameCell = wrap.querySelector('td.name');
    const before = nameCell.getBoundingClientRect().left;
    wrap.scrollLeft = wrap.scrollWidth;
    const after = nameCell.getBoundingClientRect().left;
    return {
      ok: true,
      scrollable: wrap.scrollWidth > wrap.clientWidth + 4,
      moved: Math.abs(after - before),
      docWidth: document.documentElement.scrollWidth,
      winWidth: window.innerWidth,
      nameVisible: nameCell.getBoundingClientRect().width > 20,
      smallest: Math.min(...[...host.querySelectorAll('td, th')]
        .map((n) => parseFloat(getComputedStyle(n).fontSize)).filter(Boolean)),
    };
  });
  assert.ok(mobile.ok, sport + ' has no sticky box-score table on a phone');
  assert.ok(mobile.scrollable, sport + ' box score does not scroll on a phone, so it is being cut off');
  assert.ok(mobile.moved < 2,
    sport + ' the player name moved ' + mobile.moved.toFixed(0) + 'px when the table scrolled');
  assert.ok(mobile.nameVisible, sport + ' the player name is not visible after scrolling');
  assert.ok(mobile.docWidth <= mobile.winWidth + 2,
    sport + ' the page itself scrolls sideways on a phone');
  assert.ok(mobile.smallest >= 11,
    sport + ' box score text is ' + mobile.smallest + 'px on a phone');

  /* 6. PRINT. Every section in the flow, controls gone, on white. */
  await mob.close();
  await phone.close();
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#result .actionbar button')]
      .find((x) => /Print/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(600);
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(250);
  const printed = await page.evaluate(() => {
    const vis = (sel) => [...document.querySelectorAll(sel)]
      .filter((n) => n.getClientRects().length > 0).length;
    return {
      controls: vis('#runBtn') + vis('#simSeg') + vis('#result .actionbar button'),
      tables: vis('#result table'),
      bg: getComputedStyle(document.body).backgroundColor,
      sections: vis('#result .printonly .sechead'),
    };
  });
  assert.strictEqual(printed.controls, 0, sport + ' prints its controls');
  assert.ok(printed.tables >= 2, sport + ' printed only ' + printed.tables + ' tables');
  assert.ok(printed.sections >= 5,
    sport + ' printed only ' + printed.sections + ' expanded sections');
  const rgb = (printed.bg.match(/\d+/g) || []).map(Number);
  assert.ok(rgb.length >= 3 && (rgb[0] + rgb[1] + rgb[2]) / 3 > 200,
    sport + ' prints on a dark background');
  await page.emulateMedia({ media: 'screen' });

  assert.deepStrictEqual(errors, [], sport + ' threw in the browser: ' + errors.join(' | '));
  console.log('  ok  ' + sport + ': all ' + (sport === 'NBA' ? NBA_SECTIONS : NHL_SECTIONS).length
    + ' sections present, box score reconciles on screen, sorts, survives a phone and prints clean');
  await page.close();
  await ctx.close();
}

(async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    await check(browser, 'NBA', SITE + '/nba-simulator/');
    await check(browser, 'NHL', SITE + '/nhl-simulator/');
  } finally {
    await browser.close();
  }
  console.log('PASS  the results experience is complete and self-consistent in the browser');
}());
