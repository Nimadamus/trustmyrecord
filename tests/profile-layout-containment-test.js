#!/usr/bin/env node
'use strict';
/**
 * PROFILE_LAYOUT_20261025
 * A long display name must not size the header, and a long bio must not
 * fill the header. Rank sentences stay the API string and wrap as prose.
 *
 *   node tests/profile-layout-containment-test.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const profile = fs.readFileSync(path.join(__dirname, '..', 'profile', 'index.html'), 'utf8');
let checks = 0;
const ok = (cond, msg) => { checks += 1; assert.ok(cond, msg); };

const cssStart = profile.indexOf('id="tmr-profile-layout-20261025"');
ok(cssStart > 0, 'containment stylesheet is present');
const css = profile.slice(cssStart, profile.indexOf('</style>', cssStart));
ok(css.includes('grid-template-columns:minmax(0,1fr) minmax(340px,420px)'), 'desktop header gives the rail a floor and lets the name column shrink');
ok(css.includes('min-width:0'), 'header tracks can shrink');
ok(/#profileHeader \.profile-name\{[\s\S]*white-space:normal/.test(css), 'display name wraps');
ok(css.includes('overflow-wrap:break-word'), 'long tokens wrap only when they do not fit');
ok(!/profile-name\{[\s\S]*word-break:break-all/.test(css), 'names are not broken on every character');
ok(css.includes('-webkit-line-clamp:4'), 'bio preview is four lines');
ok(css.includes('Read more') === false, 'copy lives in the control, not the stylesheet');
ok(css.includes('.profile-rail-value--prose'), 'rank sentences have a prose style');
ok(css.includes('@media (max-width:1180px)'), 'narrow screens stack the header');

ok(profile.includes('function profileBioHtml'), 'bio renderer exists');
ok(profile.includes('function bindProfileBio'), 'bio toggle binder exists');
ok(profile.includes('Read more') && profile.includes('Show less'), 'expand and collapse labels exist');
ok(profile.includes('escapeHtml(text)'), 'bio text is escaped before it is shown');
ok(profile.includes("p.ranking_status ||"), 'overall rank still comes from ranking_status');
ok(/const rankValue = String\(sr\.ranking_status \|\| sr\.status/.test(profile), 'sport rank still prints the API ranking_status');
ok(profile.includes('function profileRankValueClass'), 'rank prose class is shared');
ok(profile.includes("el.classList.contains('profile-rail-value--prose')"), 'the number fitter does not crush rank sentences');
ok(profile.includes('data-tmr-embed-btn'), 'Embed action is still rendered');
ok(profile.includes("onclick=\"doFollow("), 'Follow action is still rendered');
ok(profile.includes('Challenge'), 'Challenge action is still rendered');
ok(!profile.includes("p.bio ? '<div class=\"profile-bio\">' + p.bio"), 'the header no longer dumps the raw bio');

console.log('profile-layout-containment: ' + checks + ' checks passed');
