# The analytics database — the second Postgres, its locks and the visit beacon

Read with `SKILL.md` § Tenancy (the rules both databases share). Moved here unchanged from SKILL.md (2026-11-24, the
body limit).

## The analytics database (A·2, ADR-0013, 2026-11-11; plan docs/plans/2026-11-11-guardrails-infra-a2.md § A2·1 as built)

- Visits live in a **second Postgres** (`frata-analytics`), migrated from `drizzle-analytics/`
  (`drizzle.analytics.config.ts`, `npm run db:generate:analytics`), schema in `src/lib/db/analytics-schema.ts`.
  The same locks: `frata_app` with RLS, `withAnalyticsTenant` (`src/lib/db/analytics.ts`), the
  tenant from `requireMember` or the host. `check:tenant` § 8 and `scripts/verify/analytics-tenancy.sql` hold it.
- Never open it inside a main-database transaction or await it from one; it may be down, and Console › Analytics then says "Visits unavailable". A rate of orders per visit divides
  only over a window visits fully cover (`coverage` in `src/domains/analytics/traffic.ts`).
- Raw events are written only through `ingest_events()` and read only by the fold. Partitions live in `ev`, which
  has no grant; a new grant there is a bug. Rollups keep raw source inputs, classified on read (§ Attribution).
- Role settings there use `alter role … in database` (a throwaway server shares its roles with the main database).
- **The visit beacon** is `src/beacon/fe.ts`, built into `public/fe.js` (`npm run build:beacon`; `check:beacon` fails a
  stale file, the 1.7 kB ceiling, a cost field, `href`/`hash`/cookies or a DOM write). It is not a React island: no shop
  page's script grows. Its rules shared with the server are in `src/domains/analytics/beacon-rules.ts`, never copied.
  Its ingest `/api/shop/e` (`src/lib/analytics/ingest.ts`) is off until `ANALYTICS_INGEST_ON`. It runs the header
  checks before the cached shop lookup, stores paths only as the shop's own shapes, and drops personal-looking tags. A
  page tells the beacon what happened with a server-drawn `<i hidden data-fe=…>` marker, never with component code.
- Its migrations never go to the main project. Both databases are named `postgres`, and 0000 refuses to run there.
  They reach the analytics project only as the paste from `scripts/ops/analytics-paste.mjs` (docs/setup.md
  § Analytics database), never through the main account's Supabase tools.
- Grant each object by name, with the exact privilege. TRUNCATE ignores RLS. No default-privilege grants, no
  `alter policy` (drop and create), and nothing ever disables RLS. `check:tenant` § 8 fails each.
