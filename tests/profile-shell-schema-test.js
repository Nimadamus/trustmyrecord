/* GSC 11/07: Search Console "Profile page" report flagged /profile/ invalid,
   Missing field "mainEntity". The /profile/ shell is a generic app page, not one
   person's profile, so it must not declare ProfilePage without a mainEntity.
   (Baked /u/<name>/ pages keep their own ProfilePage + Person and restore it
   over the shell's JSON-LD in tmr-profile-hydrate.js restoreBakedSeo.) */
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'profile', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
assert(blocks.length >= 1, 'shell JSON-LD missing');
for (const b of blocks) {
  if (b['@type'] === 'ProfilePage') assert(b.mainEntity, 'ProfilePage without mainEntity is invalid for Google');
}
assert(blocks.some((b) => b.breadcrumb && b.breadcrumb['@type'] === 'BreadcrumbList'), 'breadcrumb must be kept');
console.log('profile shell schema test passed');
