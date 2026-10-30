'use strict';
/* =============================================================================
   SIM_DATE_MODIFIED_20261030 -- one rule for every simulator builder's
   structured-data dateModified.

   CHECKLIST #25: every rebake stamped dateModified with the bake time even when
   no game had gone final and no printed projection had moved (NFL 239 bakes
   since 9/1, NBA 105 in 7 days). A page only changes substantively when its
   results or the projections it prints change, so that is the only thing that
   moves the date.

   A builder passes the SUBSTANCE it prints (finals, and projections rounded to
   the precision shown) plus the bake time. The page keeps a fingerprint of that
   substance in an HTML comment next to the JSON-LD; on the next bake the date is
   carried forward unchanged when the fingerprint matches.

     const DM = require('./sim-date-modified.js');
     const dm = DM.resolve(outFile, substance, inputs.generated_at);
     ... dateModified: dm.date ...   and   dm.marker   anywhere in the page.
   ============================================================================= */
const fs = require('fs');
const crypto = require('crypto');

const MARK_RE = /<!--tmr-substance:([0-9a-f]{16}):([0-9TZ:.+-]+)-->/;

function fingerprint(substance) {
  return crypto.createHash('sha256').update(JSON.stringify(substance)).digest('hex').slice(0, 16);
}

/* previousHtml: the page as it was last baked ('' or null when new). */
function resolveFrom(previousHtml, substance, nowIso) {
  const fp = fingerprint(substance);
  const m = String(previousHtml || '').match(MARK_RE);
  const date = m && m[1] === fp ? m[2] : nowIso;
  return { fp, date, changed: !(m && m[1] === fp), marker: `<!--tmr-substance:${fp}:${date}-->` };
}

function resolve(file, substance, nowIso) {
  let prev = '';
  try { prev = fs.readFileSync(file, 'utf8'); } catch (e) { /* first bake */ }
  return resolveFrom(prev, substance, nowIso);
}

/* Round every number to `dp` places so print-level noise cannot move the date. */
function rounded(v, dp) {
  const k = Math.pow(10, dp == null ? 1 : dp);
  if (typeof v === 'number') return Math.round(v * k) / k;
  if (Array.isArray(v)) return v.map((x) => rounded(x, dp));
  if (v && typeof v === 'object') { const o = {}; for (const key of Object.keys(v).sort()) o[key] = rounded(v[key], dp); return o; }
  return v;
}

/* Whole-page form for builders whose printed substance is the page body:
   put DM.PLACEHOLDER where dateModified goes, then pass the finished html here.
   Bake clocks (times of day, ISO stamps), asset hashes and the marker itself are
   not substance, so they are removed before fingerprinting. */
const PLACEHOLDER = '__TMR_DATE_MODIFIED__';
function substanceOf(html) {
  const body = (String(html).match(/<body[\s\S]*<\/body>/i) || [String(html)])[0];
  return body
    .replace(/<!--tmr-substance:[^>]*-->/g, '')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '')
    .replace(/\b\d{1,2}:\d{2}\s?(AM|PM|a\.m\.|p\.m\.)?(\s?(PT|PDT|PST|ET|EDT|EST))?/gi, '')
    .replace(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[A-Z][a-z]+\.?\s+\d{1,2}(,?\s+\d{4})?/g, '')   // bake-day stamps (ptDate)
    .replace(/\?v=[0-9a-z]+/gi, '')
    .replace(/\.[0-9a-f]{12}\.(js|css)/g, '');
}
function finalize(file, html, nowIso) {
  let prev = '';
  try { prev = fs.readFileSync(file, 'utf8'); } catch (e) { /* first bake */ }
  const r = resolveFrom(prev, substanceOf(html), nowIso);
  let out = String(html).split(PLACEHOLDER).join(r.date).replace(/<!--tmr-substance:[^>]*-->\r?\n?/g, '');
  const i = out.search(/<\/head>/i);
  if (i >= 0) out = out.slice(0, i) + r.marker + '\n' + out.slice(i);
  return out;
}

module.exports = { resolve, resolveFrom, fingerprint, rounded, finalize, substanceOf, PLACEHOLDER, MARK_RE };
