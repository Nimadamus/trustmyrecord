#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { checks += 1; assert.ok(cond, msg); };

const builder = read('scripts/build_profile_pages.py');
ok(builder.includes('def shell_bio_html'), 'builder: shell bios go through shell_bio_html');
ok(builder.includes('shell_bio_html(bio, e)'), 'builder: page render uses shell_bio_html');
ok(!/bio_html = f'<p class="u-bio">\{e\(bio\)\}<\/p>'/.test(builder), 'builder: long bios are not dumped as a bare paragraph');
ok(builder.includes('-webkit-line-clamp:4'), 'builder: the shell preview is four lines');
ok(builder.includes('Read more') && builder.includes('Show less'), 'builder: the disclosure has both labels');

const bw = read('u/BlackwellsPicks/index.html');
ok(bw.includes('<details class="u-bio"><summary>'), 'Blackwell shell: long bio is a disclosure');
ok(!/<p class="u-bio">/.test(bw), 'Blackwell shell: the old full paragraph is gone');
ok(!/details class="u-bio" open/.test(bw), 'Blackwell shell: the disclosure starts closed');
ok(bw.includes('BlackwellPicks.com'), 'Blackwell shell: the full biography stays in the HTML');
ok(bw.includes('>Read more<') && bw.includes('>Show less<'), 'Blackwell shell: both labels are real text');
ok(bw.includes('-webkit-line-clamp:4'), 'Blackwell shell: preview clamp is in the page CSS');

const bet = read('u/BetLegend/index.html');
ok(/<p class="u-bio">Restoring integrity to a shady industry\.<\/p>/.test(bet), 'BetLegend shell: a short bio stays a paragraph');
ok(!/<details class="u-bio">/.test(bet), 'BetLegend shell: a short bio has no disclosure');

console.log(`profile-shell-bio-test: ok (${checks} checks)`);
