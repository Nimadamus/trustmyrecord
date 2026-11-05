'use strict';
/* =============================================================================
   SIM UX LAYER TAGS                                          SIM_UX_20261030
   One place that knows how a simulator page loads the shared UX layer
   (static/css/tmr-sim-ux.css + static/js/tmr-sim-ux.js, content-hashed ?v=).

     const SIMUX = require('./sim-ux.js');
     html = SIMUX.inject(html);          // every builder, just before writing

   scripts/stamp-sim-ux.js applies the same inject() to hand-maintained pages and
   tests/sim-ux-layer-test.js fails if any simulator page lacks the current block.
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CSS = 'static/css/tmr-sim-ux.css';
const JS = 'static/js/tmr-sim-ux.js';
const BLOCK_RE = /<!--SIM_UX-->[\s\S]*?<!--\/SIM_UX-->\r?\n?/g;

/* BROADCAST_PRESENTATION_20261105: the product shell. Chosen from the page's own
   canonical, so a rebake of any page keeps it without a per builder edit. The
   class goes on <html> from the head, before first paint, so nothing jumps. */
const BC_CSS = 'static/css/tmr-sim-broadcast.css';
const BC_JS = 'static/js/tmr-sim-broadcast.js';
const BC_RE = /<!--SIM_BC-->[\s\S]*?<!--\/SIM_BC-->\r?\n?/g;
const BC_CANON = /<link[^>]*rel=["']canonical["'][^>]*href=["']https:\/\/trustmyrecord\.com\/([a-z0-9/-]+?)\/?["']/i;
function bcKind(html) {
  const m = BC_CANON.exec(String(html));
  const p = m ? m[1] : '';
  if (p === 'sports-simulators') return ['hub', 'all'];
  let x = /^(mlb|nfl|nba|nhl)-simulator$/.exec(p);
  if (x) return ['game', x[1]];
  x = /^(mlb|nfl|nba|nhl)-simulator\/results\/run$/.exec(p);
  if (x) return ['run', x[1]];
  x = /^(mlb|nfl|nba|nhl)-(?:season-simulator|playoff-simulator|playoff-odds)$/.exec(p);
  if (x) return ['shell', x[1]];
  return null;
}
function bcBlock(kind) {
  return `<!--SIM_BC--><link rel="stylesheet" href="/${BC_CSS}?v=${hashOf(BC_CSS)}">`
    + `<script>(function(r){r.classList.add('simbc','simbc-${kind[0]}');r.setAttribute('data-bc','${kind[1]}');`
    + `function g(){r.classList.add('bc-ready')}addEventListener('load',g);setTimeout(g,2500)}(document.documentElement))</script>`
    + `<script defer src="/${BC_JS}?v=${hashOf(BC_JS)}"></script><!--/SIM_BC-->`;
}

/* Directories whose pages are simulator pages (every .html below them). */
const SIM_DIRS = [
  'sports-simulators',
  'mlb-simulator', 'mlb-game-simulator', 'mlb-predictions-simulator', 'mlb-season-simulator', 'mlb-playoff-simulator', 'mlb-playoff-odds',
  'nfl-simulator', 'nfl-season-simulator', 'nfl-playoff-simulator',
  'nba-simulator', 'nba-season-simulator', 'nba-playoff-simulator',
  'nhl-simulator', 'nhl-season-simulator', 'nhl-playoff-simulator',
];

function hashOf(rel) {
  // Same token as scripts/stamp-asset-refs.js: 12 hex of sha256 over the bytes git stores (LF).
  const bytes = fs.readFileSync(path.join(ROOT, rel), 'latin1').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(Buffer.from(bytes, 'latin1')).digest('hex').slice(0, 12);
}

function block() {
  return `<!--SIM_UX--><link rel="stylesheet" href="/${CSS}?v=${hashOf(CSS)}"><script defer src="/${JS}?v=${hashOf(JS)}"></script><!--/SIM_UX-->`;
}

/* Puts exactly one current block in the page, just before </head>. */
function inject(html) {
  const b = block();
  const eol = /\r\n/.test(html) ? '\r\n' : '\n';
  let out = String(html).replace(BLOCK_RE, '').replace(BC_RE, '');
  const i = out.search(/<\/head>/i);
  if (i < 0) return html;
  const kind = bcKind(html);
  return out.slice(0, i) + b + eol + (kind ? bcBlock(kind) + eol : '') + out.slice(i);
}

function simPages() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.html')) out.push(full);
    }
  };
  for (const d of SIM_DIRS) walk(path.join(ROOT, d));
  return out;
}

module.exports = { inject, block, simPages, SIM_DIRS, BLOCK_RE, CSS, JS, hashOf, BC_RE, bcKind, bcBlock };
