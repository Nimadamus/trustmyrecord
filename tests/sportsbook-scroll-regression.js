/* Sportsbook scroll regression.
   Unit changes and pick submit must not move window scroll.
   An unchanged odds refresh must not rebuild the board.
   A real height insert still anchors when overflow-anchor is left on, which is
   the production bug, and does not move scroll once the sportsbook opts out.
   No network picks are created. */
const { chromium } = require('C:/Users/BL/tmrfe3/node_modules/playwright');
const path = require('path');

const HARNESS = 'file:///' + path.resolve(__dirname, 'sportsbook-scroll-harness.html').replace(/\\/g, '/') + '?sport=NFL';
const fails = [];

function check(name, ok, detail) {
  const line = (ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : '');
  console.log(line);
  if (!ok) fails.push(line);
}

async function y(page) {
  return page.evaluate(() => Math.round(window.scrollY));
}

async function arm(page) {
  await page.evaluate(() => {
    window.__watchStop = true;
    clearTimeout(window.__watchTimer);
    window.__samples = [];
    const row = document.querySelector('#sbnBoard article.sbn-row');
    if (row) row.dataset.watch = '1';
    window.__watchStop = false;
    const tick = () => {
      if (window.__watchStop) return;
      const watched = document.querySelector('#sbnBoard article.sbn-row[data-watch="1"]');
      const footer = document.querySelector('.page-footer');
      const input = document.getElementById('sbnUnits0');
      window.__samples.push({
        y: Math.round(window.scrollY),
        row: watched ? Math.round(watched.getBoundingClientRect().top) : null,
        footer: footer ? Math.round(footer.getBoundingClientRect().top) : null,
        input: input ? Math.round(input.getBoundingClientRect().top) : null
      });
      window.__watchTimer = setTimeout(tick, 50);
    };
    tick();
  });
}

async function go(page, top) {
  await page.evaluate((n) => window.scrollTo({ top: n, behavior: 'instant' }), top);
  await page.waitForTimeout(40);
}

function span(values) {
  if (!values.length) return 0;
  return Math.max.apply(null, values) - Math.min.apply(null, values);
}

async function moved(page, from) {
  const snap = await page.evaluate(() => {
    window.__watchStop = true;
    clearTimeout(window.__watchTimer);
    return { now: Math.round(window.scrollY), samples: window.__samples || [] };
  });
  const ys = snap.samples.map((s) => s.y);
  const rows = snap.samples.map((s) => s.row).filter((v) => v != null);
  const feet = snap.samples.map((s) => s.footer).filter((v) => v != null);
  const lostRow = snap.samples.some((s) => s.row == null);
  const delta = Math.abs(snap.now - from);
  const drifted = span(ys) > 2 || span(rows) > 2 || span(feet) > 2 || lostRow;
  return {
    now: snap.now,
    delta: delta,
    drifted: drifted,
    ys: ['y' + span(ys), 'row' + span(rows), 'foot' + span(feet), lostRow ? 'LOST' : 'kept']
  };
}

async function revealSubmit(page) {
  await page.evaluate(() => {
    const btn = document.getElementById('sbnSubmit');
    const slip = document.getElementById('sbnSlip');
    if (!btn || !slip) return;
    const slipRect = slip.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.bottom > slipRect.bottom - 8 || btnRect.top < slipRect.top) {
      slip.scrollTop += btnRect.top - slipRect.top - 12;
    }
  });
}

async function clickSel(page, selector) {
  const loc = page.locator(selector).first();
  const box = await loc.boundingBox();
  if (!box) throw new Error('missing ' + selector);
  await page.mouse.click(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));
  return box;
}

async function ready(page) {
  await page.waitForFunction(() => document.querySelectorAll('#sbnBoard article.sbn-row').length >= 12, null, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#sbnBoard .tpf-chipline').length >= 12, null, { timeout: 8000 });
  await page.waitForTimeout(400);
}

async function mark(page) {
  return page.evaluate(() => {
    const row = document.querySelector('#sbnBoard article.sbn-row');
    const chip = document.querySelector('#sbnBoard .tpf-chipline');
    row.dataset.token = 'row1';
    chip.dataset.token = 'chip1';
    return {
      rows: document.querySelectorAll('#sbnBoard article.sbn-row').length,
      chips: document.querySelectorAll('#sbnBoard .tpf-chipline').length,
      top: Math.round(row.getBoundingClientRect().top)
    };
  });
}

async function tokens(page) {
  return page.evaluate(() => ({
    row: !!document.querySelector('#sbnBoard article.sbn-row[data-token="row1"]'),
    chip: !!document.querySelector('#sbnBoard .tpf-chipline[data-token="chip1"]'),
    rows: document.querySelectorAll('#sbnBoard article.sbn-row').length,
    chips: document.querySelectorAll('#sbnBoard .tpf-chipline').length,
    top: Math.round((document.querySelector('#sbnBoard article.sbn-row') || {}).getBoundingClientRect ? document.querySelector('#sbnBoard article.sbn-row').getBoundingClientRect().top : 0),
    units0: (document.getElementById('sbnUnits0') || {}).value || '',
    units1: (document.getElementById('sbnUnits1') || {}).value || '',
    calc0: ((document.querySelectorAll('.sbn-slipcalc')[0] || {}).textContent) || '',
    totals: ((document.querySelector('.sbn-sliptotals') || {}).textContent) || '',
    sel: document.querySelectorAll('#sbnBoard .sbn-chip.is-sel').length,
    fail: ((document.querySelector('.sbn-fail') || {}).textContent) || '',
    ok: ((document.querySelector('.sbn-ok') || {}).textContent) || '',
    live: ((document.getElementById('sbnLive') || {}).textContent) || '',
    focus: document.activeElement ? (document.activeElement.id || document.activeElement.className || document.activeElement.tagName) : '',
    picks: (window.__sbNext && window.__sbNext.state.picks.length) || 0,
    mode: window.__sbNext && window.__sbNext.state.stakeMode
  }));
}

async function scenario(browser, label, viewport, mobile) {
  const page = await browser.newPage({ viewport: viewport });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(HARNESS, { waitUntil: 'domcontentloaded' });
  await ready(page);
  check(label + ' board', (await page.locator('#sbnBoard article.sbn-row').count()) >= 12);
  check(label + ' funnel chips', (await page.locator('#sbnBoard .tpf-chipline').count()) >= 12);

  await go(page, 0);
  await clickSel(page, '#sbnBoard article.sbn-row >> nth=0 >> .sbn-chip[data-pick]');
  await clickSel(page, '#sbnBoard article.sbn-row >> nth=1 >> .sbn-chip[data-pick]');
  await page.waitForTimeout(50);
  let t = await tokens(page);
  check(label + ' two picks', t.picks === 2 && t.sel === 2, 'picks=' + t.picks + ' sel=' + t.sel);

  if (mobile) {
    await page.evaluate(() => document.documentElement.classList.add('sbn-slip-open'));
    await page.waitForTimeout(300);
  }

  await go(page, 1400);
  await arm(page);
  const from = await y(page);
  const before = await mark(page);
  const totalsBefore = (await tokens(page)).totals;
  await clickSel(page, '#sbnSlip [data-units="0"][data-dir="1"]');
  await page.waitForTimeout(500);
  let m = await moved(page, from);
  t = await tokens(page);
  check(label + ' increase units stays', m.delta <= 2 && !m.drifted && t.units0 === '1.5', 'y ' + from + '->' + m.now + ' units=' + t.units0 + ' ys=' + JSON.stringify(m.ys));
  check(label + ' board not rebuilt', (await tokens(page)).row !== false && t.chip !== undefined, '');
  const afterInc = await tokens(page);
  check(label + ' same row and chip nodes', afterInc.row && afterInc.chip, 'row=' + afterInc.row + ' chip=' + afterInc.chip);
  check(label + ' row did not shift', Math.abs(afterInc.top - before.top) <= 1, before.top + '->' + afterInc.top);
  check(label + ' totals changed', afterInc.totals !== totalsBefore && /Total risk/.test(afterInc.totals), afterInc.totals);

  await arm(page);
  const fromDec = await y(page);
  await clickSel(page, '#sbnSlip [data-units="0"][data-dir="-1"]');
  await clickSel(page, '#sbnSlip [data-units="0"][data-dir="-1"]');
  await page.waitForTimeout(400);
  m = await moved(page, fromDec);
  t = await tokens(page);
  check(label + ' decrease units stays', m.delta <= 2 && !m.drifted && t.units0 === '0.5', 'y ' + fromDec + '->' + m.now + ' units=' + t.units0);

  await arm(page);
  const fromEdit = await y(page);
  await page.evaluate(() => {
    const input = document.getElementById('sbnUnits1');
    input.focus({ preventScroll: true });
    input.value = '9';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  m = await moved(page, fromEdit);
  t = await tokens(page);
  check(label + ' manual edit clamps and stays', m.delta <= 2 && !m.drifted && t.units1 === '5' && t.units0 === '0.5', 'units1=' + t.units1 + ' y=' + m.now);

  await arm(page);
  const fromKey = await y(page);
  await page.evaluate(() => document.querySelector('#sbnSlip [data-units="1"][data-dir="-1"]').focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  m = await moved(page, fromKey);
  t = await tokens(page);
  check(label + ' keyboard decrease stays', m.delta <= 2 && !m.drifted && t.units1 === '4.5', 'units1=' + t.units1 + ' focus=' + t.focus);
  check(label + ' focus stayed on the control', /sbn-step/.test(t.focus), t.focus);

  await arm(page);
  const fromMode = await y(page);
  const calcBefore = (await tokens(page)).calc0;
  await clickSel(page, '#sbnSlip [data-mode="to_win"]');
  await page.waitForTimeout(200);
  m = await moved(page, fromMode);
  t = await tokens(page);
  check(label + ' stake mode stays', m.delta <= 2 && !m.drifted && t.mode === 'to_win' && t.calc0 !== calcBefore && /Risk /.test(t.calc0), t.calc0);

  if (mobile) await page.evaluate(() => document.documentElement.classList.remove('sbn-slip-open'));
  await page.mouse.move(Math.min(180, viewport.width * 0.4), mobile ? 40 : viewport.height * 0.45);
  await page.mouse.wheel(0, -700);
  await page.waitForTimeout(700);
  const up = await y(page);
  await page.waitForTimeout(700);
  const upLater = await y(page);
  check(label + ' wheel up sticks', up < fromMode - 80 && Math.abs(upLater - up) <= 2, 'from ' + fromMode + ' up ' + up + ' later ' + upLater);

  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(700);
  const down = await y(page);
  await page.waitForTimeout(700);
  const downLater = await y(page);
  check(label + ' wheel down sticks', down > up + 40 && Math.abs(downLater - down) <= 2, 'up ' + up + ' down ' + down + ' later ' + downLater);

  if (mobile) {
    await page.evaluate(() => document.documentElement.classList.add('sbn-slip-open'));
    await page.waitForTimeout(300);
  }
  await go(page, 1600);
  await arm(page);
  const fromBad = await y(page);
  await page.evaluate(() => {
    window.auth = { isLoggedIn: function () { return true; } };
    window.api = {
      isLoggedIn: function () { return true; },
      createPick: function () { return Promise.resolve({}); }
    };
  });
  await revealSubmit(page);
  await clickSel(page, '#sbnSubmit');
  await page.waitForTimeout(400);
  m = await moved(page, fromBad);
  t = await tokens(page);
  check(label + ' submit error stays', m.delta <= 2 && !m.drifted && t.picks === 2 && /could not be saved/.test(t.fail), 'picks=' + t.picks + ' fail=' + t.fail + ' y=' + m.now);
  check(label + ' error is in an alert', (await page.locator('.sbn-fail[role="alert"]').count()) === 1);

  await arm(page);
  const fromOk = await y(page);
  await page.evaluate(() => {
    window.api.createPick = function () { return Promise.resolve({ pick: { id: 42 } }); };
  });
  await revealSubmit(page);
  await clickSel(page, '#sbnSubmit');
  await page.waitForTimeout(500);
  m = await moved(page, fromOk);
  t = await tokens(page);
  check(label + ' submit success stays', m.delta <= 2 && !m.drifted && t.picks === 0 && /submitted/.test(t.ok), 'picks=' + t.picks + ' ok=' + t.ok.slice(0, 80) + ' y=' + m.now);
  check(label + ' chips cleared', t.sel === 0, 'sel=' + t.sel);
  check(label + ' status announced', /submitted/.test(t.live), t.live.slice(0, 120));
  const still = await tokens(page);
  check(label + ' chip nodes survived submit', still.chip, 'chip=' + still.chip);

  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(700);
  const afterSubmitUp = await y(page);
  await page.waitForTimeout(800);
  const afterSubmitLater = await y(page);
  check(label + ' scroll up after submit sticks', afterSubmitUp < fromOk - 80 && Math.abs(afterSubmitLater - afterSubmitUp) <= 2, afterSubmitUp + ' later ' + afterSubmitLater);

  if (mobile) await page.evaluate(() => document.documentElement.classList.remove('sbn-slip-open'));
  await go(page, 0);
  await page.evaluate(() => {
    var row = document.querySelectorAll('#sbnBoard article.sbn-row')[2];
    var chip = row && row.querySelector('.sbn-chip[data-pick]');
    if (chip) chip.click();
  });
  if (mobile) {
    await page.evaluate(() => document.documentElement.classList.add('sbn-slip-open'));
    await page.waitForTimeout(300);
  }
  await go(page, 1200);
  await arm(page);
  const fromAgain = await y(page);
  await page.evaluate(() => {
    window.api.createPick = function () { return Promise.resolve({ pick: { id: 43 } }); };
  });
  await revealSubmit(page);
  await clickSel(page, '#sbnSubmit');
  await page.waitForTimeout(400);
  m = await moved(page, fromAgain);
  t = await tokens(page);
  check(label + ' second submit stays', m.delta <= 2 && !m.drifted && t.picks === 0 && /submitted/.test(t.ok), 'y ' + fromAgain + '->' + m.now);

  await go(page, 1500);
  await page.evaluate(() => {
    const chip = document.querySelector('#sbnBoard .tpf-chipline');
    if (chip) chip.dataset.token = 'refresh1';
  });
  await arm(page);
  const fromRefresh = await y(page);
  await page.evaluate(() => window.__sbNext.render());
  await page.waitForTimeout(600);
  m = await moved(page, fromRefresh);
  const kept = await page.evaluate(() => !!document.querySelector('#sbnBoard .tpf-chipline[data-token="refresh1"]'));
  check(label + ' unchanged odds refresh stays', m.delta <= 2 && !m.drifted && kept, 'kept=' + kept + ' y ' + fromRefresh + '->' + m.now);

  await page.evaluate(() => {
    const g = window.__sbNext.state.games[0];
    g.main.h2h[0].odds = -188;
  });
  const oddsTrace = await page.evaluate(() => new Promise((resolve) => {
    const foot = document.querySelector('.page-footer');
    const snap = () => ({
      y: Math.round(window.scrollY),
      h: document.getElementById('sbnBoard').offsetHeight,
      foot: foot ? Math.round(foot.getBoundingClientRect().top) : null,
      token: !!document.querySelector('#sbnBoard .tpf-chipline[data-token="refresh1"]')
    });
    const samples = [snap()];
    window.__sbNext.render();
    samples.push(snap());
    [50, 150, 300, 600].forEach((ms) => setTimeout(() => samples.push(snap()), ms));
    setTimeout(() => resolve(samples), 700);
  }));
  const price = await page.evaluate(() => {
    const row = document.querySelector('#sbnBoard article.sbn-row');
    return row ? row.textContent.indexOf('-188') !== -1 : false;
  });
  const oddsSpan = (key) => {
    const vals = oddsTrace.map((s) => s[key]).filter((v) => v != null);
    return vals.length ? Math.max.apply(null, vals) - Math.min.apply(null, vals) : 0;
  };
  const oddsKept = oddsTrace.every((s) => s.token);
  check(label + ' changed odds keep board height', price && oddsKept && oddsSpan('h') <= 2 && oddsSpan('foot') <= 2 && oddsSpan('y') <= 2,
    'price=' + price + ' kept=' + oddsKept + ' h=' + oddsSpan('h') + ' foot=' + oddsSpan('foot') + ' y=' + oddsSpan('y'));

  check(label + ' no page errors', errs.length === 0, errs.join(' | ').slice(0, 300));
  await page.close();
}

async function anchorProof(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(HARNESS, { waitUntil: 'domcontentloaded' });
  await ready(page);
  await go(page, 1600);
  await page.evaluate(() => {
    document.documentElement.style.overflowAnchor = 'auto';
    const board = document.getElementById('sbnBoard');
    board.style.overflowAnchor = 'auto';
  });
  const before = await y(page);
  await page.evaluate(() => {
    const board = document.getElementById('sbnBoard');
    const d = document.createElement('div');
    d.id = 'anchorProbe';
    d.style.height = '420px';
    board.insertBefore(d, board.firstChild);
  });
  await page.waitForTimeout(900);
  const after = await y(page);
  check('anchoring still moves scroll when enabled', after >= before + 380, before + '->' + after);

  await page.evaluate(() => {
    const probe = document.getElementById('anchorProbe');
    if (probe) probe.remove();
    document.documentElement.style.overflowAnchor = '';
    document.getElementById('sbnBoard').style.overflowAnchor = '';
  });
  await go(page, 1600);
  await page.waitForTimeout(100);
  const held = await y(page);
  await page.evaluate(() => {
    const board = document.getElementById('sbnBoard');
    const d = document.createElement('div');
    d.id = 'anchorProbe2';
    d.style.height = '420px';
    board.insertBefore(d, board.firstChild);
  });
  await page.waitForTimeout(900);
  const stayed = await y(page);
  check('anchoring opt-out holds a 420px insert', Math.abs(stayed - held) <= 2, held + '->' + stayed);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    await scenario(browser, 'desktop', { width: 1440, height: 900 }, false);
    await scenario(browser, 'mobile', { width: 390, height: 844 }, true);
    await anchorProof(browser);
  } finally {
    await browser.close();
  }
  console.log(fails.length ? ('FAILED ' + fails.length) : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
