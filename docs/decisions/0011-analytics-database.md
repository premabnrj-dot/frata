# ADR-0011: Visits live in a second Postgres

Status: accepted (owner, 2026-11-11: "We'll go for separate database … cleaner/better/scalable"; A·2 calls 1–5 as
recommended) · spec `docs/specs/2026-11-10-analytics-a2.md` · plan `docs/plans/2026-11-11-guardrails-infra-a2.md`
§ A2 · builds on ADR-0002, ADR-0006

## Context
A·2 counts shop visits ourselves (no GA4 or Vercel Web Analytics on the shops). The events run to one row or more per
page view: about 30,000 a shop a month, many times that at a festive peak. The main database holds orders and
payments. Bursts of events in it would compete with checkout for connections, I/O and the 20 s statement budget.

## Decision
- **Events, the per-visitor-day fold and the rollups live in their own Postgres**: the Supabase project
  `frata-analytics` (ref `frbyvvxxqheigcutlamj`), in a separate Supabase account, with the Data API off. It is
  migrated from `drizzle-analytics/`, and its schema is in `src/lib/db/analytics-schema.ts`.
- **The same isolation as the main database (ADR-0002):**
  - `frata_app` has no BYPASSRLS; every table has RLS;
  - rollups are keyed tenant first under `app_current_tenant()` policies;
  - raw partitions sit in an ungranted schema;
  - `withAnalyticsTenant` in code;
  - `check:tenant` § 8 and `scripts/verify/analytics-tenancy.sql` hold it.
- **Nothing in it is a fact of record:** an order, profit and attribution stay in the main database. Traffic joins
  the two by (IST day, channel) in TypeScript, never by person, and never inside a main-database transaction.
- **The visitor is an HMAC with a daily salt** that stays in that database and is deleted each day. No IP, cookie or
  stored identifier is linkable to a person.
- **Work runs inside it:**
  - pg_cron folds every 15 minutes and maintains every hour;
  - no Vercel cron or extra role is involved.
- **Migrations:**
  - The owner pastes them through the project's SQL editor (`node scripts/ops/analytics-paste.mjs`), because the
    session's Supabase connection belongs to the main account.
  - 0000 refuses to run on the main database.

## Consequences
- Two databases to run: a second plan to pay for at launch (about $10 a month on Pro), and a disk alert on it in
  Admin › Infrastructure (A2·5). A Free project pauses after a week idle.
- The analytics database can be down while shops sell: the beacon drops events (at most 2 s each), and Traffic says
  "Visits unavailable".
- Raw events are kept 90 days and rollups 2 years. Whether DPDP Rule 8(3) asks for one year is open with the lawyer.
