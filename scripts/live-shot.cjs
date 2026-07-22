#!/usr/bin/env node
/*
 * Live production verification: load trustmyrecord.com/mlb-simulator/ in a real
 * browser, run a real simulation for a chosen matchup, and capture the rendered
 * lineup + freshness/provenance line from the box score.
 *
 * Usage: node scripts/live-shot.cjs AWAY HOME [outPrefix]
 */
'use strict';
const { chromium } = require('C:/Users/Nima/site-qa/node_modules/playwright');
const fs = require('fs');

const AWAY = process.argv[2] || 'SF';
const HOME = process.argv[3] || 'KC';
const PREFIX = process.argv[4] || ('live_' + AWAY + '_at_' + HOME);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('https://trustmyrecord.com/mlb-simulator/?v=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 90000 });

  const build = await page.evaluate(() => document.body.getAttribute('data-mlb-simulator-build'));
  console.log('live page build attr:', build);

  // wait for team pools to populate
  await page.waitForFunction(() => {
    const s = document.getElementById('awayTeamSelect');
    return s && s.options.length > 2;
  }, { timeout: 90000 });

  // hide any overlay/modal so the screenshot is clean
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if ((cs.position === 'fixed' || cs.position === 'sticky') && Number(cs.zIndex) > 100) el.style.display = 'none';
    });
  });

  const picked = await page.evaluate(([away, home]) => {
    const S = window.TMRMlbSimulator;
    const find = ab => (S.state.teams.current || []).filter(t => t.abbreviation === ab)[0];
    const a = find(away), h = find(home);
    if (!a || !h) return null;
    S.state.awayTeamId = a.id; S.state.homeTeamId = h.id;
    const as = document.getElementById('awayTeamSelect'), hs = document.getElementById('homeTeamSelect');
    if (as) { as.value = String(a.id); as.dispatchEvent(new Event('change', { bubbles: true })); }
    if (hs) { hs.value = String(h.id); hs.dispatchEvent(new Event('change', { bubbles: true })); }
    return { away: a.name, home: h.name };
  }, [AWAY, HOME]);
  if (!picked) { console.error('could not select teams'); await browser.close(); process.exit(1); }
  console.log('matchup:', picked.away, '@', picked.home);

  await page.waitForTimeout(3000);
  await page.evaluate(() => window.TMRMlbSimulator.runSimulation());
  await page.waitForTimeout(2000);

  // pull the rendered lineups + provenance straight out of the DOM
  const dom = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.player-team-box').forEach(box => {
      const label = box.querySelector('.team-box-label');
      if (!label || !/Batting/i.test(label.textContent)) return;
      const chip = box.querySelector('.lineup-status-chip');
      const notes = Array.from(box.querySelectorAll('.player-source-note')).map(n => n.textContent.trim());
      const rows = Array.from(box.querySelectorAll('tbody tr')).map(tr => {
        const c = tr.querySelector('th, td');
        return c ? c.textContent.replace(/\s+/g, ' ').trim() : '';
      }).filter(Boolean);
      out.push({ team: label.textContent.trim(), chip: chip ? chip.textContent.trim() : null, notes, batters: rows });
    });
    return out;
  });

  console.log('\n=== LIVE RENDERED BOX SCORE ===');
  dom.forEach(b => {
    console.log('\n' + b.team);
    console.log('  chip: ' + b.chip);
    b.notes.forEach(n => console.log('  note: ' + n));
    b.batters.forEach((r, i) => console.log('   ' + (i + 1) + '. ' + r));
  });
  fs.writeFileSync('_' + PREFIX + '.json', JSON.stringify({ build, matchup: picked, dom, errors }, null, 1));

  const panel = await page.$('#playerBoxScorePanel');
  if (panel) await panel.screenshot({ path: '_' + PREFIX + '_box.png' });
  await page.screenshot({ path: '_' + PREFIX + '_full.png', fullPage: true });
  console.log('\nscreenshots: _' + PREFIX + '_box.png, _' + PREFIX + '_full.png');
  if (errors.length) console.log('PAGE ERRORS:', errors.join(' | '));
  else console.log('page errors: none');
  await browser.close();
})();
