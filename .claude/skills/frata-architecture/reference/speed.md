# frata-architecture — Speed

Part of `frata-architecture` (SKILL.md holds the rules every change obeys: layers, tenancy, auth, actions, the outside world). These sections are moved here unchanged (practices plan G4).

## Contents

- Speed

## Speed (review 2026-11-08; findings P1–P15 in `docs/research/2026-11-08-performance-security-motion-review.md`)

Budgets. Each says whether a gate holds it yet:

| Budget | Held by |
|---|---|
| Shop first-load JS ≤ 120 kB gz | `check:storefront-build` |
| Every shop route ISR; second visit HIT | build + `check:payload` |
| Console/Admin/partner first-load JS ≤ 150 kB gz (pages pinned at their 2026-11-16 size + 2 kB; customizer 208; sign-in, start, join and the look editor and preview groups not budgeted) | `check:storefront-build` |
| Largest shop page HTML ≤ 300 kB raw, RSC ≤ 150 kB; lists paged | lists page at 48 (`PAGE_SIZE`, `/products/page/N`, e2e 13-paging); HTML bytes a review |
| A cached loader entry ≤ 1 MB (Next refuses > 2 MB, silently) | `catalogue-size.int.test.ts` (880 kB at 600 products with an offer; `src/lib/storefront/catalogue-entry.ts`) |
| A cold shop page ≤ 12 statements, none repeated | review (loaders are `cache()`d since P3) |
| No preloaded font and `priority` only on the first section's photos | review (P6, P15 fixed) |
| Console page < 1 s p95; a query < 100 ms at the 10× seed, no seq scan on `orders` | review + EXPLAIN |
| **Named exception:** Analytics' window aggregate (one grouped read of a period and the one before) is held to the page's 1 s, not 100 ms (the timings at 10× live in the test's header) | `analytics-speed.int.test.ts` (`SPEED=1`) |
| **Named exception:** Orders' filter values with counts and saved views' counts (N1c): their own transaction, `jit = off`, an 800 ms ceiling, no count on a timeout; never inside another read | review (speed N1c: 18–212 ms at 150 k) |

Rules:
- Every exported storefront loader is `cache(shopCached(...))`. `unstable_cache`
  does not merge parallel misses, and layout, `generateMetadata` and page
  render in parallel.
- **Never** call a cached loader or `withTenant` inside a `withTenant`
  callback; pass `tx` (`*In(tx, …)`). A second connection inside a
  transaction deadlocks a full pool until the 30 s idle-in-transaction
  timeout (P4).
- A page opens one `withTenant` and runs independent reads with `Promise.all`
  inside it (postgres-js pipelines them). One transaction per helper, one
  after another, is the slow shape (P8).
- `cache()`d functions take no array or object argument; `cache` keys on
  identity, so `requireMember(CAN_BUILD)` misses the layout's entry (P7).
- A shopper's write invalidates the narrowest tag it can: the product, not
  the shop. A sell-out's catalogue purge runs at most once per shop per 30 s across every instance (`refreshSoldOut`,
  limiter `soldOutPurge`); one inside a purged window queues ONE trailing purge at its end (`soldOutTrail`, in
  `after()`), never dropped. A sell-out is the last piece by stock OR hold (stock − held − owed), and an offer an order
  uses up (`usedUp`) purges the same way: the bar (`shopAnnouncement`) is tagged catalogue with the showcase. So do a
  live product's new photos from the Photos page (`addPhotos`, PI·2): many products' photos, one purge per 30 s.
- **Shop pages read holds once per entry** (`heldByVariant`, grouped from the holds index): `heldSql` per variant over a
  3,000-variant catalogue cost 265 ms at 10× (1 ms grouped). Checkout's ≤ 20 variants keep `heldSql`; one rule.
- A flash drop (2026-11-11): placing an order waits at most 2 s for a lock (`set local lock_timeout`) and a shop places
  at most `PLACE_SLOTS` (8) orders at once, as transaction advisory locks shared by every instance
  (`src/lib/orders/place.ts`); past either, 503 "busy, try again", `Retry-After: 2`, nothing written, and the try is
  given back to the IP limit (`uncount`). A try whose order was already placed finds it before any slot. **The phone
  limit counts orders** (2026-11-12): counted before placement, given back unless the try wrote a new order
  (`Placed.fresh`).
  Everything else that takes stock shares the slots and the wait (`takeSlot`): a payment landing, a switch to pay on
  delivery, a retried payment (`src/lib/orders/payment.ts`). A captured payment is recorded FIRST where nothing waits
  (a Razorpay-shaped `webhook_events` row; storing a capture keeps the order's hold ≥ 15 min while it still runs),
  then applied if there is room — the browser's reply, a switch or a released hold that finds a capture, alike.
  `processEvents` takes a slot only when something waits; a lock wait, deadlock, serialization failure or statement
  timeout inside an event LEAVES it unprocessed (marking it would lose the payment); the 5-minute drain
  (`/api/cron/drain`) is the next pass; the order page says "Payment received · confirming" and looks again
  (`paymentWaiting`).
- A cached loader (`shopCached`) never runs inside a `withTenant`: it opens a second connection while the first is
  held, and at a drop the pool deadlocks (P4). Read it before the transaction, or after it closes (`quoteData`
  resolves offer collections after its transaction).
- Fonts: a shop preloads only its own face; console faces never reach `/s/` (P6).
- Pool: `POOL` in src/lib/db/index.ts (`idle_timeout: 20, connect_timeout: 5, max_lifetime: 600`), and
  `attachDatabasePool` on Vercel through a pg-shaped adapter: `withTenant` reports each release
  (`poolReleased`). It does not know postgres-js and throws on it unadapted.
- **Row security keeps Postgres off an index for ILIKE / LIKE** (not leakproof): a trigram index helps
  no query `frata_app` runs (P10, measured; drizzle/0044). Search a tenant's history with ILIKE only
  where the plan can walk an ordered index and stop at the page (orders search: 100 ms at 150k), or
  through a tenant-bound definer — measured both ways first.
- **No expression index for a tenant's search** (N1c speed review, measured at 150 k under RLS): `right(phone, 4)`
  and any function is not leakproof, so the index is never used; a search compares plain columns with `=` (AWB:
  `shipments (tenant_id, tracking_number)`, 0.12 ms) and never ORs a fast test with the name's ILIKE (one parse,
  `parseOrderSearch`, picks the test). An unqualified column in a correlated subquery binds to the inner table: write
  `"orders"."id"`, never `${orders.id}`, inside one (N1c: an AWB search matched nothing).
- **A list that answers as you type** (N1c, Orders): a GET rows route next to the page, reading the page's own query
  string, building rows with the page's own builder (`orders/_components/rows.ts`), one transaction (list ‖ prefix,
  then risk), no counts, `statement_timeout` on a name scan, rate-limited per member, `private, no-store`, logs
  `errName` only. Fetch one row past the page ("50+") instead of a window count.
- **One analytics window for every read** (Neel N1b): `src/domains/analytics/period.ts` parses the address and gives
  `[start, end)` against `[prevStart, prevEnd)`; orders, visits and the charts all take it, and every read bounds by
  `end` (a custom range ends in the past). Custom is at most 92 days (a year and its comparison timed out at 3 s).
- **Charts in one savepoint, last** (`src/lib/queries/analytics-series.ts`): savepoints cannot nest under `Promise.all`
  on one connection, and its `SET LOCAL statement_timeout` outlives the savepoint, so it runs after every other read; a
  failure hides the charts, never the page. Fold related series into ONE statement at the finest grain (a 3-hour IST slot
  × kind) and derive days, weeks and the heat in TypeScript (speed review: half the time of three statements).
- **A named exception to the 100 ms query budget**: "+ Filter"'s values with counts (`filterValues`) and saved views'
  counts (`viewCounts`) run in their own transaction with `jit = off` and an 800 ms ceiling, streamed or on demand, and
  show no count when they time out; never inside another read's transaction.
