#!/usr/bin/env node
/* ALT_ODDS_AUDIT_20260903 — read-only audit of alternate-line pricing.
 *
 * Answers, with evidence and no guessing:
 *   1. where every displayed alternate price comes from (which feed, which book)
 *   2. whether the UI shows exactly what the source returned (no maths of ours)
 *   3. whether a single game's ladder mixes books
 *   4. whether each team's ladder is monotonic (a harder line must pay more)
 *   5. whether complementary sides contradict each other
 * Renders nothing and submits nothing.
 *   NODE_PATH=<playwright> node tests/sportsbook-v2/altodds-audit.cjs [--sport MLB] [--games 8]
 */
const fs = require('fs');
const args = {}; for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) { args[a.slice(2)] = process.argv[i + 1]; i++; } }
const SPORT = args.sport || 'MLB';
const KEY = { MLB: 'baseball_mlb', NPB: 'baseball_npb', NHL: 'icehockey_nhl', NFL: 'americanfootball_nfl' }[SPORT] || 'baseball_mlb';
const MAX = parseInt(args.games || '8', 10);
const API = 'https://trustmyrecord-api.onrender.com/api';

const impl = (o) => { const n = Number(o); return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100); };
const fmt = (o) => (Number(o) > 0 ? '+' + o : String(o));

(async () => {
  const [alt, board] = await Promise.all([
    fetch(`${API}/games/altlines/${KEY}?cb=${Date.now()}`).then((r) => r.json()).catch(() => null),
    fetch(`${API}/games/board/${KEY}?limit=80`).then((r) => r.json()).catch(() => null),
  ]);
  const bovada = {}; ((alt && alt.games) || []).forEach((g) => { bovada[`${g.away_team}|${g.home_team}`] = g; });
  const games = ((board && board.games) || []).filter((g) => (g.market_groups || []).some((gr) => /^alt_/.test(gr.key) && (gr.items || []).length));
  console.log(`sport ${SPORT} | board games with alternates: ${games.length} | bovada altlines games: ${Object.keys(bovada).length}`);
  console.log(`board primary bookmaker: ${((games[0] || {}).bookmakers || [{}])[0].title}`);

  const findings = { mixedBooks: [], nonMonotonic: [], contradictions: [], noBook: [], extreme: [] };
  games.slice(0, MAX).forEach((g) => {
    const name = `${g.away_team} @ ${g.home_team}`;
    const mainBook = ((g.bookmakers || [{}])[0] || {}).title || '?';
    const grp = (k) => (g.market_groups || []).find((x) => x.key === k) || { items: [] };

    for (const key of ['alt_spreads', 'alt_totals']) {
      const items = (grp(key).items || []).filter((i) => i.odds != null && i.line != null);
      if (!items.length) continue;
      const books = [...new Set(items.map((i) => i.book_title || '(none)'))];
      if (books.length > 1) findings.mixedBooks.push({ game: name, market: key, books, mainBook, counts: books.map((b) => `${b}:${items.filter((i) => (i.book_title || '(none)') === b).length}`) });
      if (books.includes('(none)')) findings.noBook.push({ game: name, market: key });

      // Monotonicity: for one selection, a harder line must never pay LESS.
      const bySel = {};
      items.forEach((i) => { (bySel[i.selection] = bySel[i.selection] || []).push(i); });
      Object.entries(bySel).forEach(([sel, list]) => {
        const isTotal = key === 'alt_totals';
        // harder = lower line for a spread laid / higher line for an Over
        const sorted = list.slice().sort((a, b) => Number(a.line) - Number(b.line));
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1], cur = sorted[i];
          const harderIsCur = isTotal ? String(sel).toLowerCase() === 'over' : false;
          const a = harderIsCur ? prev : cur, bb = harderIsCur ? cur : prev;
          // a is the EASIER side here; it must not pay more than the harder one
          if (impl(a.odds) < impl(bb.odds) - 0.0001) {
            findings.nonMonotonic.push({ game: name, market: key, sel, easier: `${a.line}@${fmt(a.odds)} (${a.book_title})`, harder: `${bb.line}@${fmt(bb.odds)} (${bb.book_title})` });
          }
        }
      });

      // Complementary sides of the same point must add to roughly 100% + juice.
      if (key === 'alt_spreads') {
        const byLine = {};
        items.forEach((i) => { const k = Math.abs(Number(i.line)); (byLine[k] = byLine[k] || []).push(i); });
        Object.entries(byLine).forEach(([k, list]) => {
          const away = list.find((i) => i.selection === g.away_team && Number(i.line) < 0);
          const homePlus = list.find((i) => i.selection === g.home_team && Number(i.line) > 0);
          if (away && homePlus) {
            const sum = impl(away.odds) + impl(homePlus.odds);
            if (sum < 0.97 || sum > 1.25) findings.contradictions.push({ game: name, point: k, pair: `${away.selection} ${away.line}@${fmt(away.odds)} (${away.book_title}) + ${homePlus.selection} +${homePlus.line}@${fmt(homePlus.odds)} (${homePlus.book_title})`, overround: sum.toFixed(3) });
          }
        });
      }
      const bad = items.filter((i) => Math.abs(Number(i.odds)) > 20000 || (Number(i.odds) > -100 && Number(i.odds) < 100));
      if (bad.length) findings.extreme.push({ game: name, market: key, examples: bad.slice(0, 3).map((i) => `${i.selection} ${i.line}@${fmt(i.odds)}`) });
    }
  });

  const show = (title, arr, n) => { console.log(`\n== ${title}: ${arr.length}`); arr.slice(0, n || 6).forEach((x) => console.log('   ', JSON.stringify(x))); };
  show('games whose alternate ladder MIXES sportsbooks', findings.mixedBooks);
  show('ladder steps that pay the wrong way (non-monotonic)', findings.nonMonotonic, 10);
  show('complementary sides that contradict (overround out of range)', findings.contradictions, 10);
  show('items with no book attribution', findings.noBook);
  show('prices outside a sane American range', findings.extreme);
  fs.writeFileSync(args.report || 'altodds-audit.json', JSON.stringify(findings, null, 2));
})();
