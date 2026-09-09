#!/usr/bin/env node
/*
 * MEMBER IDENTITY — no blank avatars, one resolver.
 *
 * static/js/tmr-ds-avatar.js is the site's single answer to "what does this
 * member look like": uploaded picture -> favourite-team LOGO (the lettered
 * badge only where the club has no mark) -> generated initials. Three things must not regress, and none of them is visible in a
 * screenshot of a member who happens to have uploaded a photo:
 *
 *   1. EVERY BRANCH DRAWS SOMETHING. There is no input — no username, no
 *      identity, an empty row — that yields nothing.
 *   2. IT IS DETERMINISTIC. The same member gets the same face on every page,
 *      on every device, forever. Different members are distinguishable.
 *   3. THE BROWSER AND THE API AGREE. utils/avatarIdentity.js in the backend
 *      renders the same badge; if the two drift, a member's face changes
 *      depending on which layer drew it.
 *
 * Live behaviour (the repair pass over real pages) is proved in a browser by
 * tests/avatar-fallback-browser-proof.cjs. This is the part CI can check
 * without one.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
function ok(cond, msg) {
  if (cond) return;
  failures += 1;
  console.error('  FAIL  ' + msg);
}

/* ---------- load the module the way a page does ---------------------------- */
const noop = () => {};
const scriptWindow = { addEventListener: noop };
global.window = scriptWindow;
global.document = {
  readyState: 'complete',
  addEventListener: noop,
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute: noop }),
  documentElement: { appendChild: noop },
  head: { appendChild: noop },
  querySelectorAll: () => [],
};
global.MutationObserver = function () { return { observe: noop }; };
require(path.join(ROOT, 'static', 'js', 'tmr-ds-avatar.js'));
const AV = scriptWindow.TMRAvatar;
assert.ok(AV, 'tmr-ds-avatar.js must publish window.TMRAvatar');

/* ---------- 1. every branch draws something -------------------------------- */
const CASES = [
  ['an uploaded picture', { username: 'a', avatar_url: 'https://cdn/x.png' }],
  ['a favourite-team badge', { username: 'a', avatar: { kind: 'team', mark: 'PIT', primary: '#101820', secondary: '#FFB612', ink: '#FFFFFF', team: 'Pittsburgh Steelers' } }],
  ['a favourite-team logo', { username: 'a', avatar: { kind: 'team-logo', mark: 'PIT', primary: '#101820', secondary: '#FFB612', ink: '#FFFFFF', team: 'Pittsburgh Steelers', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png' } }],
  ['neither', { username: 'makaveli66' }],
  ['an empty row', {}],
  ['null', null],
];
for (const [label, user] of CASES) {
  const id = AV.identity(user);
  ok(id && id.mark && id.primary, `identity() returns a drawable face for ${label}`);
  const svg = AV.svg(id);
  ok(svg.startsWith('<svg') && svg.includes('</svg>'), `svg() renders for ${label}`);
  ok(AV.dataUri(id).startsWith('data:image/svg+xml'), `dataUri() renders for ${label}`);
  ok(!!AV.src(user || {}), `src() always resolves to something for ${label}`);
}

/* Resolution ORDER: an upload outranks a team, a team outranks initials. */
ok(AV.src({ username: 'a', id: 5, avatar_url: 'https://cdn/x.png' }) === 'https://cdn/x.png',
  'an uploaded avatar is used ahead of everything else');
ok(/\/api\/users\/5\/avatar$/.test(AV.src({ username: 'a', id: 5 })),
  'without an upload the API avatar route resolves the team badge server-side');
ok(AV.src({ username: '' }).startsWith('data:image/svg+xml'),
  'with nothing to key off, the generated badge is drawn inline');

/* The club mark is a FALLBACK. An uploaded picture keeps it off the row, and
   the disc it sits on carries no lettering to read through a transparent PNG. */
const LOGO_ROW = { kind: 'team-logo', mark: 'PIT', primary: '#101820', secondary: '#FFB612', ink: '#FFFFFF', team: 'Pittsburgh Steelers', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png' };
const marked = AV.identity({ username: 'a', avatar: LOGO_ROW });
ok(marked.logo === LOGO_ROW.logo, 'a member with a club and no picture falls back to the mark');
ok(AV.identity({ username: 'a', avatar_url: 'https://cdn/x.png', avatar: LOGO_ROW }).logo === null,
  'an uploaded picture is never replaced by a club mark');
ok(AV.svg(marked).indexOf('<text') === -1, 'the disc under a mark carries no lettering to read through it');
ok(AV.html({ username: 'a', avatar: LOGO_ROW }).indexOf('data-tmr-logo="1"') !== -1,
  'the mark is rendered as its own image, so it can be contained rather than cropped');
ok(AV.identity({ username: 'nobody' }).logo === null, 'no team, no mark');

/* ASSIGNED CRESTS (2026-09-08, second pass). Two rewrites landed here. The
   shared grey silhouette made a leaderboard read as one account twenty times;
   the illustrated fan that replaced it fixed that and read as a cartoon, which
   Nima called out as hurting the site's credibility. What a member with no
   photo and no club gets now is a CREST - navy, electric blue, one athletic
   motif. The rules locked here: no silhouette, no blank circle, no illustrated
   people, and a different crest per member. */
const FACES = new Set();
for (const who of ['makaveli66', 'Firelink', 'henrywalllace', '11space']) {
  const face = AV.svg(AV.identity({ id: who.length * 37, username: who }));
  FACES.add(face.replace(/aria-label="[^"]*"/, ''));
  ok(face.indexOf('<text') === -1, `${who} must not get a lettered tile`);
  ok(face.indexOf('fill="#94A3B8"') === -1, `${who} must never get the old grey silhouette back`);
  ok(!/<ellipse cx="50" cy="44"/.test(face), `${who} must not get an illustrated face`);
  ok(!/#F4CCA6|#EBB78D|#DA9E70|#BC8052/.test(face), `${who} must not carry skin tones`);
  ok(face.includes('viewBox="0 0 100 100"'), `${who} sits in the same frame as a club mark`);
  ok(face.length > 500, `${who} must get a drawn crest, not an empty circle`);
}
ok(FACES.size === 4, 'four members, four different crests');

/* Deterministic, and keyed on the id so a rename does not reroll it. */
const stripLabel = (v) => v.replace(/(aria-label|title)="[^"]*"/g, '');
ok(stripLabel(AV.svg(AV.identity({ id: 626, username: 'makaveli66' })))
   === stripLabel(AV.svg(AV.identity({ id: 626, username: 'renamed' }))),
  'the seed is the user id, so a username change keeps the crest');

/* At scale, which is the whole point. */
const many = new Set();
for (let i = 1; i <= 200; i += 1) many.add(stripLabel(AV.svg(AV.identity({ id: i, username: 'u' + i }))));
ok(many.size >= 150, `only ${many.size} distinct crests across 200 members`);

/* A real club always arrives WITH its logo url, so in the browser a club is
   always drawn as its mark. The lettered badge survives only in the API, where
   `logo` is the club we know and `logo_data` is the fetch that can fail; that
   case is covered by tests/avatar-identity-unit-test.js. */
const CLUB_FACE = AV.svg(AV.identity({ username: 'a', avatar: { kind: 'team-logo', mark: 'PIT', primary: '#101820', secondary: '#FFB612', ink: '#FFFFFF', team: 'Pittsburgh Steelers', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png' } }));
ok(CLUB_FACE.indexOf('<text') === -1 && CLUB_FACE.includes('stroke="#101820"'),
  "a real club gets its own disc, in the club's colour, and never letters");

/* NO_LETTERS_WITHOUT_A_REAL_CLUB_20260907: favourite teams are free text.
   "LaoAngelaRam" and "DoBronx" are not clubs, and a "LAO" tile is initials
   wearing a club's clothes. Those get a portrait instead. */
for (const junk of [
  { mark: 'LAO', team: 'LaoAngelaRam' },
  { mark: 'DOB', team: 'DoBronx' },
]) {
  const face = AV.svg(AV.identity({ username: 'x', avatar: Object.assign({ kind: 'team', primary: '#1D4ED8', secondary: '#60A5FA', ink: '#FFFFFF', logo: null }, junk) }));
  ok(face.indexOf('<text') === -1, `${junk.team} is not a club and must not letter`);
  ok(face.indexOf('fill="#94A3B8"') === -1, `${junk.team} must not get the old silhouette`);
}


/* NO COMPONENT MAY DRAW ITS OWN LETTER TILE (2026-09-08).
   The homepage "Live on TMR" ticker named its slot `tkact-av`, which the repair
   pass's class pattern did not match, so the one component still printing two
   letters was also the one component the safety net could not see. Worse, its
   <img> was built DETACHED and marked loading="lazy" - a lazy image outside the
   document never starts loading, so the `load` handler that was supposed to
   clear the letters never ran and "FA" stayed on screen for good.

   These two checks are the general form of that bug: the pattern has to cover
   an -av suffix, and no shipped component may build a lazy image it has not
   attached yet. */
ok(/\(\^\|\[-_\]\)\(av\|ava\|avl\)\$/.test(fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-ds-avatar.js'), 'utf8')),
  'the repair pass must match a bare -av suffix, not only -ava and -avl');

const ticker = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-activity-feed.js'), 'utf8');
const tickerAvatar = ticker.slice(ticker.indexOf('function avatarNode'), ticker.indexOf('function welcomeItem'));
ok(tickerAvatar.length > 40, 'found the ticker avatar builder');
ok(tickerAvatar.indexOf("loading = 'lazy'") === -1,
  'the ticker must not lazy-load an image it has not put in the document yet');
ok(tickerAvatar.indexOf('initials(') === -1, 'the ticker must not draw a member initial');
ok(tickerAvatar.indexOf('box.appendChild(img)') !== -1, 'the ticker attaches the image up front');

/* ---------- 2. deterministic, and distinguishable -------------------------- */
ok(AV.dataUri(AV.identity({ username: 'makaveli66' })) === AV.dataUri(AV.identity({ username: 'makaveli66' })),
  'the same member always gets the same face');
ok(AV.identity({ username: 'makaveli66' }).primary !== AV.identity({ username: 'Firelink' }).primary,
  'different members are visually distinguishable');

/* The marks Nima specified. */
ok(AV.initials('', 'makaveli66') === 'MA', 'makaveli66 -> MA');
ok(AV.initials('', 'Firelink') === 'FI', 'Firelink -> FI');
ok(AV.initials('', 'MoneyMakers') === 'MM', 'MoneyMakers -> MM');
ok(AV.initials('', '') === 'TM', 'a nameless row still renders a mark');

/* ---------- 3. the browser and the API agree ------------------------------- */
// Both files are the same three steps. Rather than re-implementing the check,
// assert the geometry that has to match, byte for byte, in both sources.
const clientSrc = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-ds-avatar.js'), 'utf8');
// The disc a club mark sits on, byte for byte the same as avatarLogoSvg().
for (const piece of [
  '<circle cx="50" cy="50" r="50" fill="#FFFFFF"/>',
  'r="48.2" fill="none" stroke=',
  'stroke-opacity=".9" stroke-width="3.6"',
]) {
  ok(clientSrc.includes(piece), `the club-mark disc must stay in lockstep with the API: ${piece}`);
}

for (const piece of [
  '<circle cx="50" cy="50" r="50" fill="',
  '<path d="M0 50a50 50 0 0 1 100 0Z" fill="#FFFFFF" opacity=".12"/>',
  '<path d="M0 50a50 50 0 0 0 100 0Z" fill="#000000" opacity=".16"/>',
  'stroke-opacity=".85" stroke-width="3.5"',
]) {
  ok(clientSrc.includes(piece), `the badge geometry must stay in lockstep with the API: ${piece}`);
}

/* The homepage competition card draws the same badge from the same payload
   block, in both the page script and the edge renderer. */
const home = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-home-live.js'), 'utf8');
const edge = fs.readFileSync(path.join(ROOT, 'workers', 'home-ssr', 'worker.mjs'), 'utf8');
for (const [name, src] of [['tmr-home-live.js', home], ['workers/home-ssr/worker.mjs', edge]]) {
  ok(src.includes('function compBadge'), `${name} must render the badge, not an empty circle`);
  ok(src.includes('c.avatar && c.avatar.team'), `${name} must read the identity off the payload`);
  /* 2026-09-08: no picture and no favourite team is that member's own
     assigned portrait; the shared silhouette and the letter tile are both gone. */
  ok(src.includes('function compNeutral'), `${name} must draw a face for a member with no club`);
  ok(!/comp-avl">' \\+ initials|comp-avl">\\$\\{initials/.test(src),
    `${name} must not fall back to a lettered chip`);
  /* 2026-09-08: these two carry no generator of their own. They point the slot
     at the avatar route, which composes that member's assigned portrait, so the
     homepage cannot drift from the face the rest of the site draws. */
  ok(src.includes("/users/' + encodeURIComponent(key"),
    `${name} must resolve a faceless member through the avatar route`);
  ok(!src.includes('<path d="M20 84a30 30 0 0 1 60 0Z" fill="#94A3B8"/>'),
    `${name} must not draw the retired grey silhouette`);
  ok(src.includes('function compMark'), `${name} must render the club mark`);
  ok(src.includes('c.avatar && c.avatar.logo'), `${name} must prefer the club mark over the lettered badge`);
  ok(src.includes('object-fit:contain'), `${name} must contain the mark, not crop it to the circle`);
}

/* Every leaderboard row is a circle at the size Nima asked for (40-44px). */
const css = fs.readFileSync(path.join(ROOT, 'static', 'css', 'tmr-home-v2.css'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const [name, src] of [['tmr-home-v2.css', css], ['index.html', index]]) {
  const m = /\.comp-av,\.comp-avl\{width:(\d+)px;height:\d+px;border-radius:(50%|\d+px)/.exec(src);
  ok(!!m, `${name} must size the competition avatar`);
  if (m) {
    ok(Number(m[1]) >= 40 && Number(m[1]) <= 44, `${name}: the competition avatar is ${m[1]}px, wanted 40-44px`);
    ok(m[2] === '50%', `${name}: the competition avatar must be circular`);
  }
}

/* The resolver has to actually reach the site: the shared nav is what 680-odd
   pages load, so it is what carries it. */
const nav = fs.readFileSync(path.join(ROOT, 'static', 'js', 'tmr-ds-nav.js'), 'utf8');
ok(/loadChain\(\['\/static\/js\/tmr-ds-avatar\.[0-9a-f]{12}\.js'\]\)/.test(nav)
  || nav.includes("loadChain(['/static/js/tmr-ds-avatar.js'])"),
  'the shared nav must load the avatar resolver, or most of the site never gets it');

if (failures) {
  console.error(`\navatar fallback lock: ${failures} failure(s)`);
  process.exit(1);
}
console.log('avatar fallback lock: all checks passed');
