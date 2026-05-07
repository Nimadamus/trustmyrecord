#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'sportsbook', 'index.html'), 'utf8');
const sitewideNav = fs.readFileSync(path.join(root, 'static', 'js', 'tmr-sitewide.js'), 'utf8');
const sitewideCss = fs.readFileSync(path.join(root, 'static', 'css', 'tmr-sitewide.css'), 'utf8');

const headClose = html.indexOf('</head>');
assert(headClose !== -1, 'sportsbook page must have a head section');

const headHtml = html.slice(0, headClose);
assert(
  headHtml.includes('/static/css/tmr-sitewide.css'),
  'sportsbook page must load the shared sitewide header CSS from <head>'
);
assert(
  headHtml.includes('/static/js/tmr-sitewide.js'),
  'sportsbook page must load the shared sitewide header script from <head>'
);
assert(
  !html.slice(headClose).includes('/static/js/tmr-sitewide.js'),
  'sportsbook page must not depend on a late body include for the shared header'
);

assert(
  sitewideNav.includes('nav.className = "tmr-global-nav"') &&
    sitewideNav.includes('tmr-global-nav__brand') &&
    sitewideNav.includes('TRUST<span>MY</span>RECORD'),
  'shared sitewide nav must render the TrustMyRecord brand/logo'
);
assert(
  sitewideCss.includes('.tmr-global-nav') &&
    sitewideCss.includes('.tmr-global-nav__brand') &&
    sitewideCss.includes('.tmr-global-nav__mark'),
  'shared sitewide nav CSS must include visible header/brand/logo selectors'
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

console.log('sportsbook header regression test passed');
