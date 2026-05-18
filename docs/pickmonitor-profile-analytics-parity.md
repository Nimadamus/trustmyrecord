# PickMonitor Profile Analytics Parity - May 18, 2026

## Sources Searched

- Active backend: `C:\Users\Nima\trustmyrecord-backend`
- Active frontend: `C:\Users\Nima\trustmyrecord`
- Backend history commits found: `678a299` (`Metrics aggregator: add PickMonitor catalog (eU, eWP, Z, ADP, AOP)`), `8aeee88` (`Metrics aggregator: rest of PickMonitor catalog`), `91914fe` (`Persist advanced stat breakdowns`), `c4122b2` (`Use live graded stats for public profiles`)
- Frontend history commits found: `88d3be7` (`Profile: surface PickMonitor metrics on Advanced Metrics tab`), `ac94b81` (`Profile: PickMonitor-style clean tables + rest of catalog`), `103d14b` (`profile: full reconstruction of capper dashboard`)
- Active files found: `services/profileAnalytics.js`, `services/statsAggregator.js`, `routes/users.js`, `profile/index.html`, `static/js/stats-engine.js`, `approved-design-previews/index-preview-pickmonitor.html`

## Stat Inventory

| PickMonitor stat | Current TrustMyRecord status | Calculable from current ledger | Missing data if not complete | Recommended profile placement |
| --- | --- | --- | --- | --- |
| Z-score | Restored as primary odds-adjusted Z-score | Yes | None when odds exist; N/A under five graded non-push picks | Advanced Metrics |
| Odds-adjusted Z-score | Restored using per-pick expected wins and variance | Yes | None when odds exist | Advanced Metrics top row |
| Win percentage | Present | Yes | None | Core Stats |
| Net units | Present | Yes | None | Core Stats |
| ROI | Present | Yes | None | Core Stats |
| Average odds / AOP | Present | Yes | None | Advanced Metrics |
| Average bet size / AUR | Present | Yes | None | Advanced Metrics |
| Total picks | Present | Yes | None | Core Stats |
| W-L-P record | Present | Yes | None | Core Stats |
| Push count / push rate | Present | Yes | None | Core Stats / Advanced Metrics |
| Longest win streak | Present | Yes | None | Streaks |
| Longest loss streak | Present | Yes | None | Streaks |
| Current streak | Present | Yes | None | Streaks |
| Last 7 days | Present | Yes | None | Rolling Form |
| Last 30 days | Present | Yes | None | Rolling Form |
| Last 90 days | Present | Yes | None | Rolling Form |
| Rolling 25 / 50 / 100 picks | Present | Yes | None | Rolling Form |
| Best sport | Present through best/worst split | Yes | None | Sport Breakdown |
| Worst sport | Present through best/worst split | Yes | None | Sport Breakdown |
| Sport-by-sport breakdown | Present | Yes | None | Sport Breakdown |
| Market-type breakdown | Present | Yes | None | Market Breakdown |
| Favorite vs underdog performance | Present as odds bucket split | Yes | None | Market / Odds Breakdown |
| Moneyline / spread / total / prop breakdown | Present when `market_type` exists | Partially | Prop quality depends on normalized `market_type` | Market Breakdown |
| Home vs away | Not present | Partially | Needs reliable selection-to-home/away mapping for every pick | Omit until reliable, then Market Breakdown |
| Closing line value | Not present | No | Closing odds/line snapshot at close | Advanced Metrics, N/A until data exists |
| Average CLV | Not present | No | Closing odds/line snapshot at close | Advanced Metrics, N/A until data exists |
| CLV win rate | Not present | No | Closing odds/line and CLV direction | Advanced Metrics, N/A until data exists |
| Profit factor | Found in older frontend local calculator, not canonical API | Yes | None | Advanced Metrics |
| Standard deviation / volatility | Partially present as consistency score | Yes | Need expose canonical monthly/pick return variance if desired | Advanced Metrics |
| Biggest single win | Present in ledger data, not always surfaced as named card | Yes | None | Advanced Metrics or Ledger Summary |
| Biggest single loss | Present in ledger data, not always surfaced as named card | Yes | None | Advanced Metrics or Ledger Summary |
| Average odds on wins | Not canonical API field | Yes | None | Advanced Metrics |
| Average odds on losses | Not canonical API field | Yes | None | Advanced Metrics |
| Units won by month | Partially present via equity/period data; not monthly table | Yes | None | Performance Over Time |
| Units won by sport | Present through sport split | Yes | None | Sport Breakdown |
| Record by month | Not canonical API field | Yes | None | Performance Over Time |
| Performance chart / equity curve | Present | Yes | None | Performance Over Time |
| Drawdown | Present | Yes | None | Performance Over Time |
| Maximum drawdown | Present | Yes | None | Advanced Metrics / Performance Over Time |
| Hot/cold trend indicators | Partially present through rolling form | Yes | Requires product definition for labels | Rolling Form |
| Last graded pick timestamp | Present as `last_pick_at` | Yes | None | Core Stats / Profile Header |

## Implementation Notes

- Canonical calculation remains in the autograder-aligned ledger path: `services/profileAnalytics.js`.
- Pending picks and pushes are excluded from Z-score. Pushes remain included in settled totals and W-L-P record.
- Primary Z-score now uses `sum(p_i)` and `sum(p_i * (1 - p_i))` from each pick's American-odds break-even probability instead of an average-implied-probability shortcut.
- CLV, average CLV, CLV win rate, and home/away remain unavailable until the ledger stores the missing fields described above.
