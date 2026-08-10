#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const dsNav = fs.readFileSync(path.join(root, 'static', 'js', 'tmr-ds-nav.js'), 'utf8');
const sitewideCss = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-sitewide.css'), 'utf8');

const headClose = html.indexOf('</head>');
assert(headClose !== -1, 'sportsbook page must have a head section');

const headHtml = html.slice(0, headClose);

/* SHELL MIGRATION 2026-08-10.
   This guard's intent has not changed: sportsbook must carry the SHARED site
   header and must not lose the board. What changed is which shell provides that
   header. The page moved to the design system's shell-only mode, so the two
   assertions that named tmr-sitewide.js are re-pointed at tmr-ds-nav.js. They
   are not deleted -- a page silently losing its navigation is exactly what this
   file exists to prevent, and it caught precisely that during this migration. */

// tmr-sitewide.css STAYS. It is no longer the header, but 425 inline rules on
// this page and the shared layout rules are written against it and against the
// .tmr-site-shell class. Dropping it restyles the board.
assert(
  headHtml.includes('/static/css/tmr-sitewide.css'),
  'sportsbook page must keep tmr-sitewide.css: its board styling depends on it'
);
assert(
  /\/static\/css\/tmr-ds(\.[0-9a-f]{12})?\.css/.test(headHtml),
  'sportsbook page must load the design-system stylesheet from <head>'
);
assert(
  !/<script[^>]*\/static\/js\/tmr-sitewide\.js/i.test(html),
  'the legacy chrome builder must not come back: it renders a second navbar'
);
assert(
  /\/static\/js\/tmr-ds-nav(\.[0-9a-f]{12})?\.js/.test(html),
  'sportsbook page must load the design-system nav script'
);

// The body contract the shell depends on. data-tmr-route used to be set at
// runtime by tmr-sitewide.js; with that script gone it must be declared here or
// every body.tmr-site-shell[data-tmr-route="sportsbook"] rule stops matching --
// measured, that moved the container from 1318px to 1184px.
const bodyTag = html.slice(html.indexOf('<body'), html.indexOf('>', html.indexOf('<body')) + 1);
assert(bodyTag.includes('tmr-site-shell'), 'body must keep tmr-site-shell: 425 inline rules select on it');
assert(bodyTag.includes('tmr-ds-shell'), 'body must opt into the design system shell');
assert(
  bodyTag.includes('data-tmr-route="sportsbook"'),
  'body must declare data-tmr-route="sportsbook" now that no script sets it'
);

assert(
  dsNav.includes("nav.className = 'ds-nav'") &&
    dsNav.includes('ds-logo') &&
    dsNav.includes('Trust<em>My</em>Record'),
  'the shared design-system nav must render the TrustMyRecord brand/logo'
);
assert(
  sitewideCss.includes('.tmr-global-nav'),
  'sitewide CSS is still expected to exist for the board styling this page relies on'
);
assert(
  html.includes('<div id="picks" class="page-section active">') &&
    /Make Your Picks/i.test(html),
  'sportsbook page must still render the current Make Your Picks board'
);
assert(
  html.includes('sportsbook-production-fix-persist-reliability.js'),
  'sportsbook page must keep the current sportsbook reliability script'
);

let openScriptLine = null;
html.split(/\r?\n/).forEach((line, index) => {
  if (/<script\b/i.test(line)) openScriptLine = index + 1;
  if (openScriptLine && /<style\b/i.test(line)) {
    assert.fail(`sportsbook page has <style> inside an open <script> from line ${openScriptLine} to line ${index + 1}`);
  }
  if (/<\/script>/i.test(line)) openScriptLine = null;
});

console.log('sportsbook header regression test passed');
