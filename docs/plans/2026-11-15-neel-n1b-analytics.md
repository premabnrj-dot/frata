# Neel N1b — the analytics kit, on Analytics
Status: active (architecture and speed reviews folded in, 2026-11-15) · Date: 2026-11-15 ·
Spec: `docs/specs/2026-11-13-design-language-neel.md` (§ Analytics kit) · Kit mockup: `docs/mockups/2026-11-13-design-language-neel.html`
§ Analytics kit · Screen mockup: https://claude.ai/artifact/XtLc5wxpDaczJ6gqMQ2Js6 (source `docs/mockups/2026-11-15-analytics-n1b/`) ·
Approved: owner, 2026-11-15 ("approved, continue with the plan and build"; calls: 90 days becomes Custom; returning
shoppers counted by phone; the visits panels stay below the funnel, redrawn; ₹ kept only for whoever sees costs)

## Goal
Ranked problems 1 (COD/RTO) and 6 (true profit per order): a merchant sees in one screen whether this period is better
than the last, where orders came from and what each kept, when and where parcels come back, and whether shoppers return.
Measure: Analytics renders under 1 s p95 at the 10× seed; parity at 1280 and 390; every figure says what it is
compared with.

## Scope
**In:** the period picker (Today · 7 days · 30 days · This month · Custom) and its comparison with the window just before;
the kit (figures with change words coloured by meaning and a sparkline, the daily trend with tooltip, keyboard and offer
notes, split bars, the day × hour heat, state tiles with their table, the returning-shoppers table, share bars in ranked
tables); Analytics and a source's page rebuilt as drawn, desktop and phone.
**Out (later N1b steps, each its own plan):** the waterfall on True profit, Offers results, the meter and histogram on
Plan and billing, Admin infrastructure and stores; ⌘K. A saved comparison other than "previous period" (YAGNI until asked).

## Regression net first
`npm test`, typecheck, the int tests `analytics.int.test.ts`, `analytics-speed.int.test.ts` (SPEED=1; extended with the
series and the longest window, its seed given repeat phones and varied states) and `kept-restock.int.test.ts` (both call
`analyticsIn`), e2e 51-analytics, 72-traffic (`?period=30`), 90-ux and 05-shop-look, green before and after. New flow
`84-neel-analytics`: the picker (each preset, Custom, an old `?period=90`), figures and their words, the trend's tooltip
by keyboard, each new section against seeded orders, staff without ₹ kept, the phone, axe.

## Order of work
**N1b·1 — The period: one window for every read** (built: `src/domains/analytics/period.ts`)
1. `parsePeriod(params, now)` reads `?period=today|7|30|month` or `?from=&to=` (IST days, `to` ≤ today, at most 92 days:
   speed review, a year timed out at 3 s; an old `?period=90` → the last 90 days); anything else is 30 days.
   `windowFor` → `{ start, end, prevStart, prevEnd, days, toNow }`: the comparison is the same span `days` days earlier,
   ending at the same moment when the window runs to now (today so far vs yesterday up to this time: architecture
   review); `compareWords` ("vs previous 30 days", "vs yesterday at this time", "vs the 13 days before"). Its address
   shape is `periodQuery`. `PERIOD_PRESETS`, not `PRESETS` (taken by link.ts).
2. EVERY read of the page takes the window and its end: `windowSql` (`cur` is `[start, end)`, the outer filter
   `[prevStart, end)` with the previous rows `[prevStart, prevEnd)`), the pincodes, the source page's orders,
   `trafficRead`, `trafficNames` and `coverage` (by `window.days`). `PERIODS`, `isPeriod`, `windowOf` and the `Period`
   type are deleted once both pages move (True profit and Admin have their own: untouched). `setUp`'s three `set local`
   become one `set_config` select; the pincodes run beside `windowSql`.
3. `PeriodPicker` (`src/components/charts/`): the presets as links, Custom as a Dialog with two date fields, the
   comparison named beside it as words (one comparison exists: no ▾ menu; Deviations).

**N1b·2 — The kit (pure first)** (built: `src/domains/analytics/kit.ts`; Figure, Sparkline, ShareBar, SplitBars)
4. `change` (by meaning), `ticks`, `levels`, `bucketOf`/`busiest` (seven three-hour buckets, Monday first),
   `splitWords`, `STATE_TILES` keyed by the closed `State` list (a test: every state once, no shared cell); weeks are
   7-day blocks from `start`, a short last one labelled with its days ("Week 5 · 2 days"), and under 14 days the split
   bars go by day. Heat and risk ramps as tokens (`--heat-0…5`, `--risk-0…5`, pairs in check:contrast).
5. `TrendChart` (client: pointer or ←/→ moves the crosshair; a tooltip lists each series; notes as thin lines with a
   word; `role="img"` with a sentence and a visually hidden table), `Heatmap` (with its busiest words), `StateTiles`
   ("See as a table" shows the table in place), `CohortTable` ("not yet" for months still to come, never 0), `PeriodPicker`.
   Each in the N0 gallery, checked by flow 81.

**N1b·3 — The reads (speed review shapes; one transaction, one savepoint)**
6. Inside `analyticsPage`'s transaction, after the window read, ONE savepoint holds the series, pipelined, its first
   statement `set local statement_timeout = '800ms'` (savepoints cannot nest under `Promise.all` on one connection:
   speed review); a failure rolls back to it and the series sections hide, the page stays.
   (abc) ONE statement at the finest grain: 3-hour IST slot (`floor((epoch(placed_at) + 19800) / 10800)`) × payment
   kind (`paymentKindSql`) × stage = rto, with count and `sum(total)`, over `[prevStart, end)`, for the SAME orders the
   Sales figure counts (standing or holding: one predicate, shared with `windowSql`); TypeScript derives the days,
   the weeks × paid/COD and the weekday × bucket. Came back is counted on the day the order was PLACED (as the figure
   is: architecture review), so the trend and the figure agree; the tooltip says "of orders placed that day".
   (d) by state: orders with an outcome and came back, index-only on `orders_outcome_state` (0127: `orders_outcome_place` recreated with `state`
   in its INCLUDE, created new then the old dropped, as 0101 did).
   (e) returning shoppers: one aggregate per phone over all history — `min(placed_at)` and a `bit_or` month mask over
   the four whole IST months before this one (t0…t4 passed as timestamptz) — first orders in those months, and whether
   each ordered again in months 1–3; standing orders, `phone <> ''` (erasure blanks it). A covering partial index
   `orders (tenant_id, phone, placed_at) where phone <> '' and <standing>` (70–109 ms at 150 k). Its own months in its
   heading words (it does not follow the picker).
   (f) offers whose `starts_at` falls in the window (title, day): notes on the trend.
   One migration: the two indexes (custom, CONCURRENTLY-free: applied in one transaction with the owner, timed).

**N1b·4 — The screens, as drawn**
7. Analytics as drawn (header, four figures, the flow line, Sales by day, Paid online and COD by week beside When orders
   come, Where orders came from with share bars and "Source known for N%" beside its heading, Came back by state beside
   Shoppers who come back, From visit to order, then Browsers, Cities, Products and Speed on phones redrawn with the
   kit, Pincodes). Named states kept: no orders; under 30 (the tally and counts, rule 63); under half the sources known
   (the info line, rule 64); visits off, unavailable, none yet, too few; the read failed (Panel); the series failed
   (those sections hidden). Phone as drawn.
8. A source's page: the same picker and figures, its trend (its orders grouped by IST day through the same attribution
   join; the slug never reaches SQL), its orders.

## Deviations (mockup element · built · reason · owner seen)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| Custom: any dates | At most 92 days | A year and its comparison timed out at the page's 3 s (speed review, 600 k orders); 92 covers the old 90-day view; longer waits for a daily rollup | Asked in the N1b report |
| "vs previous 30 days ▾" as a menu | The comparison as words beside the picker | One comparison exists (the period before); a menu with one choice is a control that does nothing | Asked in the N1b report |
| A source's page (not drawn) | The same header, picker, figures and flow line as Analytics, then its orders; no trend yet | Built from the drawn parts; a trend per source needs the series read filtered by source, left for the next step | Asked in the N1b report |
| Browsers, Cities, Products, Speed on phones (not drawn) | Kept below the funnel as they are (their A·2 look) | Owner call 3 (2026-11-15); redrawing them is N3/N4 work | Yes, 2026-11-15 (kept); look asked in the N1b report |
| Where orders came from, with visits counted (drawn without) | The drawn table plus two columns, Visits and Orders per 100 visits; ₹ kept per visit dropped | The A·2 numbers the owner approved stay, inside the drawn table | Asked in the N1b report |
| Visits and Orders per 100 visits (drawn in the funnel's head) | Two figures above the funnel; on Today no change (visits compare whole days) | Visits are counted by day: a change against yesterday-at-this-time cannot be read | Asked in the N1b report |
| When orders come: seven hour bands | Seven rows Monday first × seven three-hour bands | As drawn in the kit; the board's sample shows four rows | Asked in the N1b report |
| No (i) on headings | The (i) kept on Where orders came from and on Visits | How a source is decided and how visits are counted are the two facts a merchant asks; Rule 0 allows a limit | Asked in the N1b report |
| Phone header: title, then the picker on its own line | PageHeader's shared phone layout: title and dates, the picker (it scrolls sideways), then Make a link | PageHeader is shared by every page; one page's header is not changed alone | Asked in the N1b report |
| Where orders came from: no Other row | An Other row (sources with few orders, and tags typed by hand), muted, after Direct or unknown | Only the top 12 sources get a row; without Other the rows would not add up to the orders above | Asked in the N1b report |
| Too few orders (not drawn) | One line above the figures; the figures stay, in counts | Rule 63 amended (design language 7.3.0) | Asked in the N1b report |
| Phone: the funnel and Pincodes (not drawn) | Stacked as on desktop, one column | The phone board stops at the cohort; the rest follows the same rule | Asked in the N1b report |

## Design review
- **UI/UX:** one question per section heading; every change names its comparison once per row; colour by meaning
  (returns up is bad); too little data says how much is needed ("Needs 20 delivered orders · 14 so far"); every chart
  has its numbers in words or a table (WCAG 1.1.1); the trend works by keyboard; Rule 0. States as listed in step 6.
- **Tenancy:** no new table; every read inside the existing `withTenant` transaction; the tenant from `requireMember`;
  the period from the address is parsed to dates, never SQL.
- **Modularity:** pure in `src/domains/analytics/{period,kit}.ts`; SQL in `src/lib/queries/analytics.ts`; components in
  `src/components/charts/` (generic: True profit and Offers reuse them); the page composes.
- **SSOT/DRY:** one window (`windowFor`) for orders and visits; one change rule (`change`) for every figure; state tile
  positions once; payment by `paymentKindSql`.
- **YAGNI/KISS:** no chart library (SVG by hand, as Home's bars); no saved comparisons; waterfall, meter and histogram
  wait for the screens that use them.
- **Scalability / performance (speed review, measured at 150 k and 600 k):** the series add 8 statements in 2 round
  trips (about 23 on the page), 60–110 ms on the reference box; (abc) 148 ms at 30 days here, (d) 13 ms, (e) 70–109 ms,
  (f) 0.1 ms; the window capped at 92 days (both windows ≤ 184 days, today's measured 90-day case).
- **Reliability:** no outbound call; the series run in one savepoint with an 800 ms ceiling: a failure hides those
  sections, never the page.
- **Security:** no new action or route; ₹ kept stays behind `costsVisibleIn`; the costs gate (`check-client-bundle`)
  holds: the chart components receive figures only.
- **Unit economics:** none (reads the profit engine's ₹ kept as today).
- **Blast radius:** `analyticsIn`/`sourcePageIn`/`trafficRead`/`trafficNames`/`coverage` callers (Analytics, a
  source's page, the int tests); `PERIODS`/`windowOf` deleted (True profit's `TP_PERIODS` and Admin's own untouched);
  two new indexes on `orders` (one more insert per standing order: negligible, HOT already blocked); flows 51 and 72.
  Not taken over here: Home's 7-day bars (they stay; the kit's TrendChart could later); Orders' `placedRange` (its own
  IST days for a filter, not a compared window).

## Verify (each step)
`npm test` · `npm run typecheck` · the analytics int tests on a Postgres · `npm run e2e -- --only neel-analytics,analytics,
true-profit,neel,ux,shop-look` · the full suite before ship · `mockup-parity-reviewer`, `design-system-reviewer`,
`impact-reviewer`, `speed-reviewer`, `words-reviewer` on the diff.

## Practices recorded in skills
frata-design-language: rule 61 amended (the picker replaces 7 · 30 · 90; the comparison at the same moment), rule 64
("Source known" beside the sources heading), and § Neel analytics (the picker, figures and their words, charts with words
and tables, colour by meaning, "not yet"), version bump. frata-architecture: one analytics window for every read; series
in one savepoint, never one per series under Promise.all; the finest-grain fold.
