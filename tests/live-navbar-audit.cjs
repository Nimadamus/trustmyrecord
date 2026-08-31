/* LIVE production navbar audit. Hits trustmyrecord.com directly - no local
   file routing - captures the header strip for each page and measures the row.

     node tests/live-navbar-audit.cjs <outdir> [--signedin] [--width=1440]

   --signedin seeds a placeholder session token so the nav builds its signed-in
   cluster (coin pill, bell, My Record, account). The balance and unread count
   come back empty because the token is not real; what is being checked is the
   LAYOUT of that cluster, which is where the reported damage was.              */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const PAGES = [
  ['homepage', '/'],
  ['sportsbook', '/sportsbook/'],
  ['handicapper-profile', '/u/BetLegend/'],
  ['handicappers', '/handicappers/'],
  ['today', '/today/'],
  ['matchup-of-the-day', '/matchup-of-the-day/today/'],
  ['tools', '/tools/'],
  ['forum', '/forum/'],
  ['compete-contests', '/contests/'],
  ['online-gaming', '/online-gaming/'],
];

const MEASURE = () => {
  const nav = document.querySelector('nav.ds-nav');
  const legacy = document.querySelector('nav.tmr-global-nav');
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 20 && getComputedStyle(el).display !== 'none'; };
  if (!nav) return { navbar: legacy && vis(legacy) ? 'LEGACY tmr-global-nav' : 'NONE', navCount: (vis(legacy) ? 1 : 0) };
  const r = nav.getBoundingClientRect();
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y), r: Math.round(b.right) }; };
  const logo = nav.querySelector('.ds-logo');
  const right = nav.querySelector('.ds-nav-right');
  const item = nav.querySelector('.ds-navitem');
  const s = item ? getComputedStyle(item) : null;
  const rightKids = Array.prototype.map.call(right ? right.children : [], (el) => {
    const b = el.getBoundingClientRect();
    return (el.className || el.tagName).toString().split(' ')[0] + ' "' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 12) + '" ' +
      Math.round(b.width) + 'x' + Math.round(b.height) + ' @x' + Math.round(b.x) + ' y' + Math.round(b.y);
  });
  // does anything in the right cluster spill past the bar, wrap onto a second
  // row, or overlap the links?
  const navBox = r;
  const mainnav = nav.querySelector('.ds-mainnav');
  const mb = mainnav ? mainnav.getBoundingClientRect() : null;
  const rb = right ? right.getBoundingClientRect() : null;
  const kidBoxes = Array.prototype.map.call(right ? right.children : [], (el) => el.getBoundingClientRect());
  const rows = new Set(kidBoxes.map((b) => Math.round(b.y / 6)));
  return {
    navbar: 'ds-nav',
    navCount: (vis(nav) ? 1 : 0) + (vis(legacy) ? 1 : 0),
    navH: Math.round(r.height * 100) / 100,
    logo: box(logo),
    itemFont: s ? s.fontFamily.split(',')[0] + ' ' + s.fontSize + '/' + s.fontWeight + ' ls' + s.letterSpacing : null,
    items: Array.prototype.map.call(nav.querySelectorAll('.ds-mainnav > *'), (el) => {
      const b = el.getBoundingClientRect();
      return (el.textContent || '').trim().split(/\s{2,}|\n/)[0].slice(0, 14) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height);
    }),
    right: rightKids,
    rightRows: rows.size,
    rightOverflowsBar: rb ? (rb.right > navBox.right + 1 || rb.top < navBox.top - 1 || rb.bottom > navBox.bottom + 1) : null,
    rightOverlapsLinks: (mb && rb) ? (rb.left < mb.right - 1) : null,
    hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    today: Array.prototype.slice.call(nav.querySelectorAll('*')).some((e) => /^today$/i.test((e.textContent || '').trim())),
    coin: (() => { const c = nav.querySelector('.v2nav-coins'); if (!c) return null; const cs = getComputedStyle(c); const b = c.getBoundingClientRect();
      const n = c.querySelector('#navCoinBalance'), i = c.querySelector('.v2nav-coins-icon');
      return { box: Math.round(b.width) + 'x' + Math.round(b.height), hidden: c.hasAttribute('hidden'),
        fill: cs.backgroundImage.slice(0, 40), ink: cs.color,
        numberPx: n ? getComputedStyle(n).fontSize + '/' + getComputedStyle(n).fontWeight : null,
        numberInk: n ? getComputedStyle(n).color : null,
        icon: i ? Math.round(i.getBoundingClientRect().width) + 'px' : null }; })(),
  };
};

(async () => {
  const out = process.argv[2];
  const signedIn = process.argv.includes('--signedin');
  const widthArg = process.argv.find((a) => a.startsWith('--width='));
  const width = widthArg ? Number(widthArg.split('=')[1]) : 1440;
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width, height: 900 } });
  if (signedIn) {
    await ctx.addInitScript(() => {
      try {
        var t = 'liveaudit.' + btoa('{"sub":"audit","exp":9999999999}') + '.sig';
        localStorage.setItem('token', t);
        localStorage.setItem('tmr_token', t);
        localStorage.setItem('user', '{"username":"AuditUser","display_name":"AuditUser"}');
      } catch (e) {}
    });
  }
  for (const [name, url] of PAGES) {
    const p = await ctx.newPage();
    p.on('pageerror', () => {});
    p.on('dialog', (d) => d.dismiss().catch(() => {}));
    let m;
    try {
      await p.goto('https://trustmyrecord.com' + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p.waitForTimeout(7000);
      m = await p.evaluate(MEASURE);
      await p.screenshot({ path: out + '/' + name + '.w' + width + (signedIn ? '.in' : '') + '.png', clip: { x: 0, y: 0, width, height: 118 } });
    } catch (e) { m = { error: String(e.message).slice(0, 70) }; }
    console.log(('[' + width + (signedIn ? '/in' : '/out') + '] ' + url).padEnd(46) + JSON.stringify(m));
    await p.close();
  }
  await b.close();
})();
