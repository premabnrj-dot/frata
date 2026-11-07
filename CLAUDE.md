# Frata — LLM context file

> **This file holds RULES, not history.** It loads before every task. A fact
> belongs here only if it is a rule an agent must obey and a script cannot check.
> Why → `docs/decisions/`. Domain rules → the skill in `.claude/skills/`.
> Anything checkable → a gate in `scripts/`.

## What this product is

A fashion-first commerce platform for small and mid-size Indian D2C brands:
COD-heavy, Instagram-driven, no developer. One deployment, three surfaces that
share neither a look nor a gate:

- **Console** — `src/app/(console)/console/`, the merchant's back office, behind
  `requireMember`. Orders with profit per order, COD risk, NDR, inbox,
  campaigns judged on delivered orders, channel connections.
- **Storefront** — `src/app/s/[host]/`, a merchant's shop, public, reached by
  host (`src/middleware.ts`, `src/domains/tenancy/host.ts`). Cached.
- **Admin** — `src/app/(admin)/admin/`, Frata staff only, behind `requireStaff`.
  The only surface that reads across merchants (ADR-0007).

**The goal:** a small Indian fashion brand keeps more profit per delivered
order, without a developer. Work that moves none of the ranked problems in
`frata-planning` § North star waits.

## Which skill to load

Planning anything → `frata-planning` first. Code that touches the database,
a route, an action or a connector → `frata-architecture`. Any UI →
`frata-design-language`. Razorpay, Shiprocket, Meta, WhatsApp, Instagram,
Google → `frata-integrations`. Prices, fees, margins, the business model →
`frata-unit-economics`. Before saying something works → `frata-verify`.
Something failing that makes no sense → `frata-gotchas`.
Agents: `tenancy-auditor`, `architecture-reviewer`, `integration-researcher`,
`unit-economics-reviewer`, `impact-reviewer` (every task's diff: callers, test
gaps, debt), `e2e-runner` (the browser flows in `e2e/`).

## Rules that apply to everything

**ONE MERCHANT NEVER SEES ANOTHER'S DATA** (ADR-0002). Two locks: the row
policy in Postgres (`drizzle/0001_tenant_isolation.sql`) and `withTenant()` in
`src/lib/db/tenant.ts`. Merchant rows are read only through `src/lib/queries/`.
The tenant id comes from `requireMember()` or the storefront host — never from
a URL, a form or a body (one named exception: starting a support session,
ADR-0007). Cross-tenant reads only through `frata_admin` in `src/lib/admin/`. A new table ships with its grant, RLS and policy in
the same migration. `npm run check:tenant` holds the shape;
`npm run verify:tenancy` proves it on a real Postgres.

**Engines are pure.** Nothing in `src/domains/**` imports React, Next, Drizzle,
postgres or the db (`check:layers`). If a domain module needs I/O, the design
is wrong.

**Derive, never duplicate.** One number, computed once, read by everyone. Profit
per order is `src/domains/orders/profit.ts`; an order's state is
`src/domains/orders/order-state.ts`, derived from timestamps — there is no
status column. Before storing a second copy of a fact, derive it.

**MONEY IS INTEGER PAISE** (ADR-0004), end to end: `bigint` columns,
`src/domains/money/paise.ts` in code, rupees only where a person types or reads
one (`src/lib/format.ts`, `<Money>`).

**A MERCHANT'S COST NEVER REACHES A SHOPPER'S BROWSER** (ADR-0003). COGS,
freight, fees and Frata's own fee are computed on the server.
`scripts/check-client-bundle.mjs` fails the build if a cost field is in any
browser chunk.

**A CALL TO THE OUTSIDE WORLD IS A ROW BEFORE IT IS A REQUEST** (ADR-0006).
Outbound: `enqueue()` into `outbox` inside the same transaction as the change.
Inbound: a webhook is verified on its raw body, stored in `webhook_events`
under our own idempotency key, answered at once, processed later.

**Verify before claiming.** Run the command, read the output, then say it works.

**Integration facts expire.** Meta, Google, Razorpay and Shiprocket change
terms monthly. A fact in `frata-integrations` carries the date it was checked
and its source; older than 90 days, recheck before building on it.

**Plans are phased, mockup first; nothing is built before the owner approves
the phase's mockup, and nothing is executed before the review agents have run
on the plan** (ADR-0001, owner 2026-11-06). Research before UX; approved rules
go into `frata-design-language`. The loop is `frata-planning`.

**A gate must not match its own documentation.** Gates skip comment lines;
run a new gate against the file that describes it.

## Before you commit

```bash
npm test          # check:hex layers dates fetch config size tenant actions states contrast scale voice motion clock, then vitest
npm run typecheck
```

Both must pass. Changed `drizzle/` or a policy? Also `npm run verify:tenancy`
against a throwaway Postgres (`frata-verify`). Changed a flow? `npm run e2e`.
CI runs all of these.

## Deploying

**Push to `main`. Never `vercel deploy`.** Vercel project `frata` (team
`premabnrj-dots-projects`, production at frata.vercel.app) builds every push;
`main` is production, every other branch a preview. Supabase project `frata`
(ref `szqwveysvbbxpjhjlnwl`). Setup state and owner steps: `docs/setup.md`.
Functions run in Mumbai
(`bom1`, `vercel.json`) beside Supabase ap-south-1 — move one, move the other.

**Migrations** are generated by drizzle-kit (`npm run db:generate`; RLS is a
`--custom` migration). From a cloud session they are applied through the
Supabase API (port 5432 is refused there): apply the SQL, then insert its row
into `drizzle.__drizzle_migrations` (sha256 of the file, the journal's `when`).

**The app connects as `frata_app` (and Admin as `frata_admin`), never `postgres`.** `postgres` bypasses the
policies. Environment variables live in Vercel; `.env.example` lists names only.

## Things that are deliberately absent

- **A Supabase service-role key.** Nothing needs one; its absence is the point.
- **Data access through PostgREST / supabase-js from the browser.** Supabase is
  auth only; `anon` and `authenticated` hold no grant on any table, and the
  Data API is switched off (owner, 2026-11-07: `service_role` keeps Supabase's
  default grants, so the REST endpoint must stay off). Never turn it back on.
- **A cross-brand shopper data network.** Not before DPDP consent design
  (obligations from 13 May 2027) and a decision superseding ADR-0002.
- **Instagram in-app checkout.** Not available in India; DMs create assisted orders.
