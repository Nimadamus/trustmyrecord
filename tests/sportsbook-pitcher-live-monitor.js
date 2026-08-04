#!/usr/bin/env node
/**
 * LIVE monitor: MLB probable pitchers on the production sportsbook board.
 *
 * Loads the real page, reads the rendered "Probable Pitcher" line for every MLB
 * slot together with that game's own start time, and cross-checks each one
 * against ESPN's probables for that game's Eastern-time date. Fails (exit 1) when:
 *
 *   - the board shows MLB games but renders no pitcher lines at all
 *   - every MLB slot is TBD (the Jul 23 2026 all-TBD outage signature)
 *   - a slot shows TBD while ESPN has a named starter for that team on that ET date
 *   - a slot shows a name ESPN does not have for that team on that ET date
 *     (stale / wrong-slate pitcher — the other half of the Jul 23 bug)
 *
 * Skips cleanly (exit 0) when there is no MLB slate or ESPN is unreachable, so
 * it never cries wolf.
 *
 * Env: TMR_SPORTSBOOK_URL (default https://trustmyrecord.com/sportsbook/)
 */

const { chromium } = require('@playwright/test');

const URL = process.env.TMR_SPORTSBOOK_URL || 'https://trustmyrecord.com/sportsbook/';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const etDate = (ms) => {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d).replace(/-/g, '');
};

function fail(msg) { console.error('FAIL: ' + msg); process.exitCode = 1; }
function skip(msg) { console.log('SKIP: ' + msg); process.exit(0); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);
  // The board opens on another league; click the MLB league button.
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('*')].filter(
      (e) => e.children.length <= 3 &&
        /^MLB\s*Baseball\s*BOARD$/i.test((e.textContent || '').replace(/\s+/g, ' ').trim())
    );
    (els[els.length - 1] || document.body).click();
  });
  // The pitcher line is enriched ASYNCHRONOUSLY from ESPN after the board paints,
  // and the page gives that fetch a 6s guard before painting TBD and not retrying
  // for five minutes. A flat 15s wait therefore reported the all-TBD OUTAGE
  // SIGNATURE on any run where the runner was slow or ESPN was briefly throttled
  // (2026-08-04: red in CI while the live board was showing 57/60 named). Poll
  // instead, and only conclude anything once the names stop arriving.
  const ENRICH_TIMEOUT_MS = 60000;
  const enrichStart = Date.now();
  for (;;) {
    const named = await page.evaluate(() => [...document.querySelectorAll('.sb-team-pitcher[data-sb-pitcher-gi]')]
      .filter((el) => !/^TBD$/i.test((el.textContent || '').trim())).length);
    if (named > 0) break;
    if (Date.now() - enrichStart > ENRICH_TIMEOUT_MS) break;
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(3000);

  // If nothing landed, find out WHY before crying outage: ask the page itself
  // whether it can reach ESPN. A runner that cannot is an environment problem,
  // not a TrustMyRecord defect, and this monitor must not red a deploy for it.
  // The self-test deliberately blanks every line to prove the detector fires, so
  // it must not be let off the hook by the reachability escape below.
  const pageCanReachEspn = (process.env.TMR_PITCHER_MONITOR_SELFTEST === 'all-tbd') || await page.evaluate(async () => {
    try {
      const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?limit=1', { cache: 'no-store' });
      if (!r.ok) return false;
      const j = await r.json();
      return Array.isArray(j.events);
    } catch (e) { return false; }
  });

  // Self-test hook: proves the detector actually fires. Not used in normal runs.
  //   TMR_PITCHER_MONITOR_SELFTEST=all-tbd   -> blank every line (outage signature)
  //   TMR_PITCHER_MONITOR_SELFTEST=stale     -> print a bogus starter (wrong-slate)
  const selfTest = process.env.TMR_PITCHER_MONITOR_SELFTEST || '';
  if (selfTest) {
    await page.evaluate((mode) => {
      document.querySelectorAll('.sb-team-pitcher[data-sb-pitcher-gi]').forEach((el) => {
        el.textContent = mode === 'all-tbd' ? 'TBD' : 'Bartolo Colon';
      });
    }, selfTest);
    console.log('SELFTEST MODE: ' + selfTest + ' (a FAIL below is the expected result)');
  }

  const scraped = await page.evaluate(() => {
    const cards = document.querySelectorAll('article.sportsbook-game-card').length;
    const games = (window.TMR && window.TMR.currentGames) || [];
    const nodes = [...document.querySelectorAll('.sb-team-pitcher[data-sb-pitcher-gi]')];
    const slots = nodes.map((el) => {
      const gi = parseInt(el.getAttribute('data-sb-pitcher-gi'), 10);
      const side = el.getAttribute('data-sb-pitcher-side');
      const g = games[gi];
      return {
        team: g ? (side === 'home' ? g.home_team : g.away_team) : '',
        side,
        pitcher: (el.textContent || '').trim(),
        commence: g ? (g.commence_time || g.commenceTime || g.start_time || g.date || '') : '',
      };
    });
    return { cards, gamesLen: games.length, slots };
  });

  await browser.close();

  if (!scraped.cards) skip('no MLB game cards on the board (no slate?)');
  if (!scraped.slots.length) {
    fail(scraped.cards + ' MLB game cards rendered but NOT ONE .sb-team-pitcher line exists. ' +
      'The pitcher renderer is gone or lobbyIsMlb() stopped matching MLB.');
    return;
  }

  const slots = scraped.slots;
  const tbd = slots.filter((s) => /^TBD$/i.test(s.pitcher));
  console.log('board: ' + scraped.cards + ' MLB games, ' + slots.length + ' pitcher slots, ' +
    tbd.length + ' TBD');

  if (slots.length >= 8 && tbd.length === slots.length) {
    if (!pageCanReachEspn) {
      skip('every slot is TBD but this environment cannot reach the ESPN scoreboard at all, ' +
        'so the board had nothing to enrich from - not a TrustMyRecord defect');
    }
    fail('EVERY MLB pitcher slot on the live board is TBD (' + slots.length + '/' + slots.length +
      ') after waiting ' + Math.round(ENRICH_TIMEOUT_MS / 1000) + 's, and ESPN IS reachable from here. ' +
      'This is the Jul 23 2026 all-TBD outage signature.');
    return;
  }

  const dated = slots.filter((s) => s.team && s.commence && !isNaN(new Date(s.commence).getTime()));
  if (!dated.length) skip('could not resolve game start times from the board; skipping ESPN cross-check');

  const ms = dated.map((s) => new Date(s.commence).getTime()).sort((a, b) => a - b);
  const range = etDate(ms[0]) + '-' + etDate(ms[ms.length - 1]);

  let espn;
  try {
    const r = await fetch(ESPN + '?dates=' + encodeURIComponent(range) + '&limit=200');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    espn = await r.json();
  } catch (e) {
    skip('ESPN unreachable (' + e.message + ') — not treating that as a site regression');
  }

  // "teamKey|YYYYMMDD" -> { names: Set }  (present but empty = ESPN says no starter yet)
  const expected = new Map();
  (espn.events || []).forEach((evt) => {
    const comp = (evt.competitions || [])[0];
    if (!comp || !Array.isArray(comp.competitors)) return;
    const dk = etDate(new Date(evt.date || comp.date || '').getTime());
    comp.competitors.forEach((c) => {
      const a = (c.probables || [])[0] && (c.probables || [])[0].athlete;
      let nm = a ? (a.displayName || a.fullName || a.shortName || '') : '';
      if (/^tbd$/i.test(String(nm).trim())) nm = '';
      const t = c.team || {};
      [t.displayName, t.shortDisplayName, t.name, t.nickname, t.location, t.abbreviation]
        .map(key).filter(Boolean)
        .forEach((k) => {
          const id = k + '|' + dk;
          if (!expected.has(id)) expected.set(id, new Set());
          if (nm) expected.get(id).add(nm.trim());
        });
    });
  });
  if (!expected.size) skip('ESPN returned no MLB events for ' + range);

  const problems = [];
  let checked = 0;
  dated.forEach((s) => {
    const dk = etDate(new Date(s.commence).getTime());
    const cands = [key(s.team), key(String(s.team).trim().split(/\s+/).pop())];
    let known = false;
    const names = new Set();
    cands.forEach((k) => {
      const set = expected.get(k + '|' + dk);
      if (set) { known = true; set.forEach((n) => names.add(n)); }
    });
    if (!known) return; // ESPN has no event for this team on this ET date — cannot judge
    checked++;
    if (/^TBD$/i.test(s.pitcher)) {
      if (names.size) {
        problems.push(s.team + ' (' + dk + ') shows TBD but ESPN lists ' + [...names].join(' / '));
      }
      return;
    }
    if (names.size && !names.has(s.pitcher)) {
      problems.push(s.team + ' (' + dk + ') shows "' + s.pitcher + '" but ESPN lists ' +
        [...names].join(' / ') + ' — stale or wrong-slate pitcher');
    } else if (!names.size) {
      problems.push(s.team + ' (' + dk + ') shows "' + s.pitcher +
        '" but ESPN has no starter named for that game');
    }
  });

  console.log('cross-checked ' + checked + ' slot(s) against ESPN ?dates=' + range);
  if (problems.length) {
    problems.forEach((p) => console.error('  - ' + p));
    fail(problems.length + ' MLB pitcher slot(s) disagree with ESPN');
    return;
  }
  console.log('Sportsbook probable-pitcher live monitor: PASS (' + (slots.length - tbd.length) +
    ' named, ' + tbd.length + ' TBD and ESPN agrees on every one)');
})().catch((e) => { console.error('FAIL: monitor crashed: ' + (e && e.stack || e)); process.exit(1); });
