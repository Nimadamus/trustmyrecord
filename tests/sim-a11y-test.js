#!/usr/bin/env node
// SIM_A11Y_20261105: every NFL, NBA and NHL hub, season and playoff page. Baked markup is read
// with the same parser a browser uses; the runtime script is driven in jsdom, no browser.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const SIMUX = require('../scripts/sim-ux.js');

const root = path.resolve(__dirname, '..');
const PAGES = ['nfl', 'nba', 'nhl'].flatMap((s) => [`${s}-simulator`, `${s}-season-simulator`, `${s}-playoff-simulator`]);
let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log('  ok  ' + name); };

for (const page of PAGES) {
  const html = fs.readFileSync(path.join(root, page, 'index.html'), 'latin1');
  const doc = new JSDOM(html).window.document;
  ok(page + ': skip link lands on main', () => {
    const skip = Array.from(doc.querySelectorAll('a[href^="#"]')).find((a) => /^skip to/i.test(a.textContent.trim()));
    assert.ok(skip, 'no skip link in the HTML');
    const target = doc.getElementById(skip.getAttribute('href').slice(1));
    assert.ok(target && target.closest('main'), 'skip target is not main');
  });
  ok(page + ': every table has a caption and every th a scope', () => {
    const tables = doc.querySelectorAll('table');
    assert.ok(tables.length > 0);
    tables.forEach((t) => assert.ok(t.caption && t.caption.textContent.trim(), 'table with no caption'));
    assert.strictEqual(doc.querySelectorAll('th:not([scope])').length, 0, 'th with no scope');
  });
  ok(page + ': a run has a live status line', () => {
    assert.ok(doc.querySelector('[role="status"][aria-live="polite"],[aria-live="polite"]'));
  });
  ok(page + ': stamp is stable', () => {
    assert.strictEqual(SIMUX.a11yStatic(html), html);
    assert.strictEqual((html.match(SIMUX.A11Y_RE) || []).length, 1);
  });
}

ok('MLB pages are left alone', () => {
  const html = fs.readFileSync(path.join(root, 'mlb-simulator', 'index.html'), 'latin1');
  assert.strictEqual(SIMUX.a11yPage(html), false);
  assert.strictEqual(SIMUX.a11yStatic(html), html);
});

ok('app templates inside scripts are not rewritten', () => {
  const src = '<link rel="canonical" href="https://trustmyrecord.com/nba-simulator/"><body><main></main>'
    + '<script>var a="<table><tr><th>x</th></tr></table>";</script></body>';
  assert.ok(SIMUX.a11yStatic(src).includes('var a="<table><tr><th>x</th></tr></table>";'));
});

// Contrast, from the colours the stylesheets declare.
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, bg, alpha) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

ok('bracket loser row clears AA on its card', () => {
  const css = fs.readFileSync(path.join(root, 'static/css/tmr-playoff-bracket.css'), 'utf8');
  const out = /\.pb \.pb-t\.out\{color:(#[0-9a-f]{6})\}/i.exec(css);
  assert.ok(out, 'loser colour moved');
  assert.ok(!/\.pb \.pb-t\.out\{[^}]*opacity/.test(css), 'opacity on the loser row is back');
  assert.ok(ratio(rgb(out[1]), rgb('#111a2b')) >= 4.5);
  assert.ok(ratio(rgb(out[1]), rgb('#040a18')) >= 4.5);
});
ok('breadcrumb links clear AA at their opacity', () => {
  const m = /nav\[aria-label="Breadcrumb"\]\{opacity:([.\d]+)\}/.exec(SIMUX.a11yBlock());
  assert.ok(m, 'block no longer sets breadcrumb opacity');
  const bg = rgb('#040a18');
  assert.ok(ratio(over(rgb('#94a3b8'), bg, Number(m[1])), bg) >= 4.5);
});
ok('links in running text are underlined, focus is visible', () => {
  const block = SIMUX.a11yBlock();
  assert.ok(/:is\(p,li\) a:not\(\[class\]\)\{text-decoration:underline/.test(block));
  assert.ok(/:focus-visible\{outline:2px solid/.test(block));
});

// Runtime.
const script = fs.readFileSync(path.join(root, 'static/js/tmr-sim-a11y.js'), 'utf8');
function dom(body) {
  const d = new JSDOM('<!doctype html><body>' + body + '</body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  d.window.eval(script);
  // jsdom fires this after the current tick; the listeners are needed now.
  if (d.window.document.readyState === 'loading') d.window.document.dispatchEvent(new d.window.Event('DOMContentLoaded'));
  return d.window;
}
const tab = (w, shift) => {
  const e = new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: !!shift, bubbles: true, cancelable: true });
  w.document.activeElement.dispatchEvent(e);
  return e;
};

ok('a table drawn after a run gets scope and a caption', () => {
  const w = dom('<h3>Box score</h3><div id="result"></div>');
  w.document.getElementById('result').innerHTML = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><th>x</th><td>1</td></tr></tbody></table>';
  w.TMRSimA11y.sweep();
  const t = w.document.querySelector('table');
  assert.strictEqual(t.caption.textContent, 'Box score');
  assert.strictEqual(t.querySelector('thead th').getAttribute('scope'), 'col');
  assert.strictEqual(t.querySelector('tbody th').getAttribute('scope'), 'row');
});
ok('sweeping twice adds nothing', () => {
  const w = dom('<table><tr><th>A</th></tr></table>');
  w.TMRSimA11y.sweep(); w.TMRSimA11y.sweep();
  assert.strictEqual(w.document.querySelectorAll('caption').length, 1);
});
ok('Tab loops inside a modal, focus returns to the opener', () => {
  const w = dom('<button id="o">run</button>');
  const d = w.document;
  d.getElementById('o').focus();
  const m = d.createElement('div');
  m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = '<button id="a">a</button><a id="b" href="/x">b</a>';
  d.body.appendChild(m);
  w.TMRSimA11y.sweep();
  d.getElementById('b').focus();
  assert.ok(tab(w).defaultPrevented);
  assert.strictEqual(d.activeElement.id, 'a');
  assert.ok(tab(w, true).defaultPrevented);
  assert.strictEqual(d.activeElement.id, 'b');
  m.remove();
  w.TMRSimA11y.sweep();
  assert.strictEqual(d.activeElement.id, 'o');
});
ok('a native dialog is left to the browser', () => {
  const w = dom('<dialog role="dialog" aria-modal="true" open><button id="a">a</button></dialog>');
  w.document.getElementById('a').focus();
  w.TMRSimA11y.sweep();
  assert.ok(!tab(w).defaultPrevented);
});
ok('the run line says running, and ready only when a new result lands', () => {
  const w = dom('<p id="simuxRun"></p><button id="runBtn">Run</button><div id="result"><div>old</div></div>');
  const d = w.document;
  const line = d.getElementById('simuxRun');
  d.getElementById('runBtn').click();
  assert.strictEqual(line.textContent, 'Simulation running.');
  w.TMRSimA11y.sweep();
  assert.strictEqual(line.textContent, 'Simulation running.');
  d.getElementById('result').innerHTML = '<div>new</div>';
  w.TMRSimA11y.sweep();
  assert.strictEqual(line.textContent, 'Results ready.');
});

console.log(passed + ' passed, 0 failed');
