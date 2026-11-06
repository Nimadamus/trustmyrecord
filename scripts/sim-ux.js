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

/* SIM_A11Y_20261105: NFL, NBA and NHL hub, season and playoff pages. Everything that can
   be baked is baked here, so it works before any script runs and survives a rebake;
   static/js/tmr-sim-a11y.js covers what is drawn later. MLB pages match nothing. */
const A11Y_JS = 'static/js/tmr-sim-a11y.js';
const A11Y_RE = /<!--SIM_A11Y-->[\s\S]*?<!--\/SIM_A11Y-->\r?\n?/g;
const A11Y_PAGE = /^(nfl|nba|nhl)-(simulator|season-simulator|playoff-simulator)$/;
const A11Y_CSS = '.simux-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}'
  + 'html.simbc :is(a,button,select,input,textarea,summary,[tabindex]):focus-visible{outline:2px solid #2fe0ff;outline-offset:2px}'
  + 'html.simbc main :is(p,li) a:not([class]){text-decoration:underline;text-underline-offset:2px}'
  + 'html.simbc .simcrumb,html.simbc main>nav[aria-label="Breadcrumb"]{opacity:.9}';
function a11yPage(html) {
  const m = BC_CANON.exec(String(html));
  return !!(m && A11Y_PAGE.test(m[1]));
}
function a11yBlock() {
  return `<!--SIM_A11Y--><style>${A11Y_CSS}</style><script defer src="/${A11Y_JS}?v=${hashOf(A11Y_JS)}"></script><!--/SIM_A11Y-->`;
}
const plainText = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
/* Scope on every th, a hidden caption named after the table's heading on every table.
   Markup only: script and style bodies are passed through, so app templates stay as they are. */
function a11yMarkup(seg, lastHeading) {
  const out = seg.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi, (row, at) => {
    if (!/<th(\s|>)/i.test(row)) return row;
    const before = seg.slice(0, at);
    const inHead = before.lastIndexOf('<thead') > before.lastIndexOf('</thead');
    const scope = inHead || !/<td(\s|>)/i.test(row) ? 'col' : 'row';
    return row.replace(/<th(?![^>]*\bscope=)(?=[\s>])/gi, `<th scope="${scope}"`);
  });
  let heading = lastHeading;
  const parts = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>|<table\b[^>]*>(\s*<caption\b)?/gi;
  let html = '';
  let from = 0;
  let m;
  while ((m = parts.exec(out))) {
    if (/^<h/i.test(m[0])) { heading = plainText(m[1]) || heading; continue; }
    if (m[2]) continue;
    const name = (/\baria-label="([^"]+)"/i.exec(m[0]) || [])[1] || heading || 'Simulation table';
    const end = m.index + m[0].length;
    html += out.slice(from, end) + `<caption class="simux-sr">${name}</caption>`;
    from = end;
  }
  return { html: html + out.slice(from), heading };
}
function a11yStatic(src) {
  const html = String(src);
  if (!a11yPage(html)) return html;
  const body = /<body\b[^>]*>/i.exec(html);
  if (!body) return html;
  const start = body.index + body[0].length;
  let heading = '';
  let tail = html.slice(start).split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/i).map((seg, i) => {
    if (i % 2) return seg;
    const r = a11yMarkup(seg, heading);
    heading = r.heading;
    return r.html;
  }).join('');
  /* The run box on the NBA and NHL hubs is the only one with no status line. */
  if (/<div id="result"/.test(tail) && !/id="simStatus"|id="simuxRun"/.test(tail)) {
    tail = tail.replace('<div id="result"', '<p id="simuxRun" class="simux-sr" role="status" aria-live="polite"></p>\n  <div id="result"');
  }
  if (!/>Skip to [^<]*<\/a>/i.test(html)) {
    const main = /<main\b[^>]*>/i.exec(tail);
    if (main) {
      let id = (/\bid="([^"]+)"/.exec(main[0]) || [])[1];
      let tag = main[0];
      if (!id) { id = 'simux-main'; tag = tag.replace('<main', `<main id="${id}"`); }
      if (!/\btabindex=/.test(tag)) tag = tag.replace(/>$/, ' tabindex="-1">');
      tail = tail.replace(main[0], tag);
      tail = `<a class="simux-skip" href="#${id}">Skip to main content</a>` + tail;
    }
  }
  return html.slice(0, start) + tail;
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
  let out = a11yStatic(String(html).replace(BLOCK_RE, '').replace(BC_RE, '').replace(A11Y_RE, ''));
  const i = out.search(/<\/head>/i);
  if (i < 0) return html;
  const kind = bcKind(html);
  return out.slice(0, i) + b + eol + (kind ? bcBlock(kind) + eol : '') + (a11yPage(html) ? a11yBlock() + eol : '') + out.slice(i);
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

module.exports = { inject, block, simPages, SIM_DIRS, BLOCK_RE, CSS, JS, hashOf, BC_RE, bcKind, bcBlock, A11Y_RE, a11yPage, a11yBlock, a11yStatic };
