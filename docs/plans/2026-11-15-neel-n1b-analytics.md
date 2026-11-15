# Neel N1b — the analytics kit, on Analytics
Status: draft (for the review agents) · Date: 2026-11-15 ·
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
`npm test`, typecheck, `src/lib/queries/__tests__/analytics.int.test.ts` and `analytics-speed.int.test.ts` (SPEED=1),
e2e 51-analytics, 70-true-profit (shares `PERIODS`), 90-ux and 05-shop-look, green before and after. New flow
`84-neel-analytics`: the period picker (each preset, Custom, an old `?period=90` link), figures with their words, the
trend's tooltip by keyboard, each new section's numbers against seeded orders, staff without ₹ kept, phone layout, axe.

## Order of work
**N1b·1 — The period, one window for every read**
1. `src/domains/analytics/period.ts` (pure): `parsePeriod(params, now)` → `today | 7 | 30 | month | custom(from, to)`
   (custom: IST days, `to` ≤ today, at most 366 days; an old `?period=90` → custom of the last 90 days; anything else →
   30); `windowFor(choice, now)` → `{ start, end, prevStart, days, label, compareLabel }` where the comparison is the
   window of the same length just before (`prevEnd = start`); "This month" against the same number of days before it.
   Unit-tested on IST edges and month starts.
2. `analyticsIn`, `sourcePageIn`, `windowSql` and `trafficRead` take the window (`placed_at` / day in `[start, end)`;
   the previous window `[prevStart, start)`), replacing `windowOf(period)`. `Period` stays for True profit and Admin
   (unchanged here). The picker: `PeriodPicker` (`src/components/charts/`), the presets as links (`?period=7`), Custom as
   a Dialog with two date fields (FIELD), the comparison named beside it.

**N1b·2 — The kit (pure first)**
3. `src/domains/analytics/kit.ts` (pure): `change(now, before, { kind: 'count' | 'money' | 'share', good: 'up' | 'down' })`
   → `{ arrow, words, tone: 'good' | 'bad' | 'flat' | 'none' }` ("↑ 12%", "↑ 2.1 points — worse", "—" with no base);
   `ticks(max)` (three nice values: ₹30k, ₹60k, ₹90k); `levels(values, 6)` (heat and state shades); `busiest(heat)`
   ("Sundays, 9–11 pm"); `STATE_TILES` (a tile grid position per state, one copy); `splitWords` ("Paid online went from
   34% to 47% of orders"); `cohortRows`. All unit-tested.
4. `src/components/charts/`: `Figure` (label, value, change, sparkline, a note when there is too little data),
   `Sparkline`, `TrendChart` (client: SVG, a crosshair moved by pointer or ←/→ on the focused chart, a tooltip listing each
   series, notes as thin lines with a word, `role="img"` with a sentence and the figures in a visually hidden table),
   `SplitBars`, `Heatmap` (with its busiest words), `StateTiles` (with "See as a table" opening the table in place),
   `CohortTable`, `ShareBar` (a cell). Tokens only (`--chart`, `--chart-now`, the neel ramp, warn and bad for returns);
   reduced motion: no animation. Each drawn in the N0 gallery (`/console/fixtures/neel`) and checked by flow 81.

**N1b·3 — The reads (one snapshot)**
5. `seriesIn(tx, tenantId, window, now)` in `src/lib/queries/analytics.ts`, inside `analyticsPage`'s transaction (its
   jit off, 3 s ceiling, 64 MB work_mem): (a) by IST day, both windows: orders and sales (standing orders), and came back
   by `rto_initiated_at` day; (b) by week of the window: paid online and COD (`paymentKindSql`); (c) day × three-hour
   bucket (IST); (d) by state: orders with an outcome and came back (`orders.state` on the closed list, ≥ 10 with an
   outcome to be shaded); (e) returning shoppers: first-order month by phone over the last four whole months and whether
   each ordered again in months 1–3 (erased orders, phone '', left out); (f) notes: offers whose `starts_at` falls in the
   window (title, day). Counts only; ₹ only in (a) sales, which every member already sees. Speed reviewer: EXPLAIN each at
   150 k; (e) is the one that reads beyond the window.

**N1b·4 — The screens, as drawn**
6. Analytics: header (title, the dates, the picker, the comparison, Make a link); four figures (Sales, Orders, Came back,
   ₹ kept after returns — only for whoever sees costs); the flow line; Sales by day; Paid online and COD by week beside
   When orders come; Where orders came from (share bars, came back, ₹ kept an order, change); Came back by state beside
   Shoppers who come back; From visit to order (the funnel), then Browsers, Cities, Products and Speed on phones redrawn
   with ShareBar and the kit's figures; Pincodes with the most returns. Every state as today: no orders, visits off,
   unavailable, none yet, too few; the read failed (Panel). Phone as drawn: figures two by two, sources as two-line rows,
   the state section in words with "See every state".
7. A source's page: the same picker and figures, its trend, its orders.

## Deviations (mockup element · built · reason · owner seen)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|

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
- **Scalability / performance:** at 150 k orders: (a)–(d) are grouped reads over the window on `orders_tenant_placed`;
  (e) reads four months by phone (`orders_tenant_phone`); all in the one transaction, ≤ 6 more statements; page < 1 s
  p95 (speed reviewer measures).
- **Reliability:** no outbound call; a failed series read hides its section, never the page (savepoint per series).
- **Security:** no new action or route; ₹ kept stays behind `costsVisibleIn`; the costs gate (`check-client-bundle`)
  holds: the chart components receive figures only.
- **Unit economics:** none (reads the profit engine's ₹ kept as today).
- **Blast radius:** `analyticsIn`/`sourcePageIn`/`trafficRead` callers (Analytics, a source's page), `PERIODS` (True
  profit, Admin pages: unchanged), flows 51 and 70.

## Verify (each step)
`npm test` · `npm run typecheck` · the analytics int tests on a Postgres · `npm run e2e -- --only neel-analytics,analytics,
true-profit,neel,ux,shop-look` · the full suite before ship · `mockup-parity-reviewer`, `design-system-reviewer`,
`impact-reviewer`, `speed-reviewer`, `words-reviewer` on the diff.

## Practices recorded in skills
frata-design-language § Neel analytics: the picker, figures and their words, charts with words and tables, colour by
meaning. frata-architecture: one analytics window for every read.
