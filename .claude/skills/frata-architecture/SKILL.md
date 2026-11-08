---
name: frata-architecture
description: Use when adding a page, route, server action, query, database table, migration, webhook, cron or connector to Frata, or when deciding where code belongs, how tenant isolation and auth are enforced, how money is stored, or how data reaches a component.
metadata:
  version: 2.8.0
  verified: 2026-11-07
  decisions: [ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007]
  covers: ["src/lib/**", "src/middleware.ts", "drizzle/**"]
---

# Frata architecture

## Layers (`check:layers`)

```
src/domains/     pure engines: money, profit, order state, host → surface. No I/O.
src/lib/         db, tenant transaction, auth, queries, outbox, webhooks, format, env
src/app/         routes: (console)/console, s/[host] (storefront), api/, login
src/components/  rendering primitives: data/, layout/, ui/, nav/
```

- A page composes; it does not query. Reads are named functions in
  `src/lib/queries/*.ts`, each `import 'server-only'` and through `withTenant`.
- A domain never imports React, Next, Drizzle, postgres or `@/lib/*` I/O.
- State is derived, not stored: `orderState()` reads timestamps.

## Tenancy (ADR-0002) — read before any database work

- `src/middleware.ts` decides the surface from the Host header
  (`src/domains/tenancy/host.ts`). Storefront hosts are rewritten to `/s/<host>`;
  `/s/*` on the console host is a 404.
- Console: `requireMember(roles)` (`src/lib/auth/require-member.ts`) gives the
  tenant id — a membership or an active support session, both from
  `app_access_for`. Storefront: `tenantForHost(host)` (`src/lib/db/platform.ts`).
  **These are the only two sources of a tenant id.**
- Console writes go through `asMember(roles, (tx, ctx) => …)`
  (`src/lib/auth/as-member.ts`): it opens the tenant transaction and, in support
  mode, writes the audit row in the same transaction (`check:actions`).
- **Admin** (ADR-0007): `requireStaff(roles)` first; reads and writes through
  `src/lib/admin/*` functions that take `StaffOk` and use `adminDb()` as
  `frata_admin`. Never `withTenant` in Admin. A new table states its
  `frata_admin` grants in the same migration (often: none).
- **Definer functions** always `set search_path = ''` and
  `revoke all on function … from public, anon, authenticated` — Postgres gives
  PUBLIC EXECUTE by default and Supabase exposes functions over RPC. Dropping and
  recreating one resets its grants: re-run them.
- Every merchant read or write: `withTenant(tenantId, tx => …)` plus an explicit
  `where tenant_id = …`. The policy is the lock; the where is the intent and
  the index.
- A page whose numbers must agree reads them in ONE `withTenant(…, { snapshot: true })`
  (read-only, repeatable read: one snapshot for every statement), composing
  `xWith(tx, tenantId, …)` readers (`queueCountsWith`, `riskFactsWith`); the
  plain `x(tenantId, …)` wraps its `xWith` in its own `withTenant` (Home's
  `todaySummary`, U·4). A slow optional part goes last, in a savepoint with
  `set local statement_timeout`, put back to `default` before the savepoint
  ends (SET LOCAL outlives RELEASE); a timeout is caught as "unavailable".
- Raw `db()` only in `src/lib/db/`, `src/lib/outbox/`, `src/app/api/webhooks/`
  (`check:tenant` PLATFORM_SCOPE). Adding to that list needs a reason in the gate.

### A new table — the checklist

1. Columns in `src/lib/db/schema.ts`: `tenant_id uuid not null references
   tenants`, indexed (composite with what pages filter on); money as
   `money('…')` (bigint paise); enums as text + CHECK + exported const tuple.
2. `npm run db:generate`, then a `--custom` migration that, for the table:
   `grant select, insert, update, delete … to frata_app`;
   `revoke all … from anon, authenticated`; `enable row level security`;
   `create policy tenant_rows … to frata_app using (tenant_id =
   app_current_tenant()) with check (tenant_id = app_current_tenant())`.
3. Add the table to `scripts/verify/tenancy.sql` (a row per tenant and the
   cross-tenant read and write checks) and run `npm run verify:tenancy`.
4. `npm test` — `check:tenant` fails a table without RLS or a policy.

## Auth

- Supabase auth only (magic link, `src/app/login/`). Data never goes through
  supabase-js or PostgREST; `anon`/`authenticated` hold no table grants.
- Always `getUser()`, never `getSession()` (`check:layers`).
- Signing in grants nothing; a `members` row does. Roles: owner, admin, staff,
  partner (`MEMBER_ROLES`); tuples `ANY_MEMBER` (everyone, partner included),
  `CAN_BUILD` (owner, admin, partner: catalogue, the look, the shop's own
  settings), `CAN_MANAGE` (owner, admin: people, the address, opening the shop).
  Payment keys are `['owner']`.
- **Adding a role: read every caller of the tuple it joins** before it joins
  (2026-11-07). A settings section declares its own `editors`
  (`src/domains/settings/sections.ts`), read by its page, its save and the brand
  upload, so a new section decides who edits it on purpose.
- **Partners** (`docs/specs/2026-11-07-partner-foundations.md`): a partner is a
  member with role `partner`, never a cross-tenant role. Their workspace reads
  only Frata's own facts about their stores, through uid-keyed definer
  functions in `src/lib/db/partners.ts` (drizzle/0023). `requirePartner()` is the
  workspace's first line (`check:actions`). `partners` has no frata_app grant.
  The attribution is `partner_links.created_at`, written once; the share's
  window starts at `share_starts_at` (first opening, a trigger) and terms are
  snapshotted from `PARTNER_TERMS`. A handover invite is never claimed at
  sign-in: it waits for Accept (`app_accept_handover`).
- A layout refuses with a panel, never a redirect (frata-gotchas) — and its
  check guards nothing below it: **every page and action calls
  `requireMember` itself.** It returns `not_configured` rather than throwing
  when the environment is unset.

## Time in client components (2026-11-07, `check:clock`)

A client component renders on the server and again in the browser. **Render never
reads the clock**: a page passes its render time once (`<NowProvider at={now.toISOString()}>`,
or a `now` prop) and components derive from `useNow()` (`src/components/time/now.tsx`).
Domain functions take `now` as an argument, never a default. Event handlers and timers may
read the real clock and mark the line `// clock-ok: <why>`. Text from two different "now"s
differs when a minute or day turns between render and hydration: React #418 (Online
payments, the product editor, 2026-11-07).

## Server actions (from Ekatan)

```ts
'use server'
export async function confirmOrder(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireMember(ANY_MEMBER)          // 1. who (check:actions)
  if (!auth.ok) return { ok: false, error: auth.message }
  const parsed = Schema.safeParse(input)                 // 2. same Zod schema as the form
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields' }
  try {
    await withTenant(auth.membership.tenantId, async (tx) => {   // 3. one transaction
      const [row] = await tx.update(orders).set({ confirmedAt: new Date() })
        .where(and(eq(orders.id, parsed.data.id), eq(orders.tenantId, auth.membership.tenantId), isNull(orders.confirmedAt)))
        .returning()                                     // 4. conditional = race safe
      if (row) await enqueue(tx, { tenantId: row.tenantId, kind: 'whatsapp.utility',
        dedupeKey: `order-confirmed:${row.id}`, payload: { orderId: row.id } })
    })
    revalidatePath('/console/orders')
    return { ok: true }
  } catch (err) {
    console.error('[confirmOrder]', err)                 // 5. tag, log, human sentence
    return { ok: false, error: 'We could not confirm the order. Nothing was changed.' }
  }
}
```

## Record actions (1D Orders, 2026-11-07)

- **Roles are passed, not hidden.** Each action's allowed roles go in its
  `asMember([...], …)` call; a hidden button is never the guard. The table of
  who may do what lives in the spec and is copied into the action file's header.
- **History in the same transaction.** Every order action writes one
  `order_events` row (append-only: `select, insert` only) inside the
  transaction that changes the order. Timestamps say where an order is; events
  say who did what and survive an undo.
- **Audit rows carry no shopper data.** A support-mode `audit_events` row has
  the record id as `target` and only the NAMES of changed fields in `detail`:
  `frata_admin` reads that table across every shop.
- **Undo reverses an EVENT, not a timestamp.** It names the `order_events`
  row it undoes, checks that row is still the order's latest and that nothing
  later moved (packed, cancelled), and restores what the event changed
  (`held_at` too). Comparing timestamps fails: SQL `now()` keeps microseconds
  a JS `Date` drops. Refused in words when something moved since.
- **History without shopper data.** `order_events` holds field NAMES (never an
  address, phone or note text) and the actor's email as it was at sign-in, so
  erasure never meets a copy and no name lookup is needed later.
- **One home for SQL predicates.** A state test written in SQL (tabs, counts,
  holds) lives in `src/lib/db/order-predicates.ts` with a parity test
  against `orderState()` on fixtures — never restated in a query.
- **Stock is per line.** `order_lines.stock_taken_at` says which lines took
  stock; a writer stamps only the lines it took (`where stock_taken_at is
  null`), so a retry, a late capture or a cancel never takes or returns twice.
- **Additive migrations deploy in this order:** every new column nullable or
  defaulted (the old code keeps writing between apply and push) → apply →
  push → re-run the idempotent backfill (`where … is null`) for rows placed in
  between → drop the backfill function in a later migration. A backfill has
  its own test from the migration before it (`scripts/verify/backfill-0019.sh`).
- **Operational state is a column, not jsonb.** `checkout` jsonb holds
  hypotheses for analysis; anything code branches on (stock taken, per line)
  is a typed column.
- **A definer function that names people takes no ids:** it reads
  `app_current_tenant()` and returns only that shop's members.
- **A read inside a caller's transaction lives beside the writers** (`src/lib/orders/`), the one exception to
  "reads go through `src/lib/queries/`": `documentsFor` takes the `asMember` transaction so a support visit
  that opens a document carrying the shopper's address is audited, and `check:tenant` requires a queries file
  to open its own `withTenant`. It still filters by tenant itself, on top of the policy.
- **Snapshot what a document needs later**, when it is issued: at placement the
  seller GSTIN and each line's share of charges, at packing the seller's legal name
  and address (`orders.seller_name`, `seller_address`). A document reads the order,
  never today's settings.

## Modules (M2 foundation, 2026-11-07, `check:modules`)

Spec: `docs/specs/2026-11-07-modules-foundation.md`. A module is a feature a
shop can have or not (Messages, RTO Shield, Reviews…).

- **One registry**: `src/domains/modules/registry.ts` (`MODULE_KEYS`, `MODULES`).
  Billing `core | plan | add_on`; `status: 'next'` until it is built. Plan
  features are `PLAN_GRANTABLE` (the plan_versions CHECK is generated from it).
- **"Usable" is decided once**: `moduleAccess(facts, now)` in
  `src/domains/modules/access.ts` (granted by core, plan, add-on or trial;
  switched on; not paused; dependencies usable). Badges and buttons come from
  `offerFor()`. Never test a plan feature or an add-on row anywhere else.
- **Facts**: `shopModules(tenantId, atIso)` (`src/lib/queries/modules.ts`),
  cached per request. Admin reads the same facts through `merchantModules()`
  (`src/lib/admin/modules.ts`) and still derives through `moduleAccess()`.
- **Tables**: `tenant_modules` (the merchant's switch; app inserts and closes),
  `tenant_addons` (granted by Frata only; app reads; admin inserts and may only
  set `ends_at`), `addon_prices` (versions), `module_pauses` (platform-wide; one
  open per module). Proof: tenancy check 29.
- **A module's server action** goes through `asModule(module, roles, what, work)`
  (a chokepoint in `check:actions`): it refuses in words, then runs as `asMember`.
- **A module's outbox kinds** are listed in its `outboxKinds`. The cron asks
  `outboxDecision()`: paused → the row waits (`deferRow`); off or not granted →
  `markDead`. Switching a module off cancels its queued rows (`cancelQueued`).
- **A module that calls the outside world** (Meta, Shiprocket) asks `moduleGate(module, roles)` first, calls out
  with no transaction open, then writes through `asModule` (which asks again). Example: `connectWhatsAppAction`.
- **One webhook URL per provider for every shop** (`/api/webhooks/whatsapp`): each item is routed by its own
  account id through a definer (`app_tenant_for_wa`, open rows only, digits only), stored one row per item under
  `whatsapp:<tenant>:<id>:<field>:<item>[:<status>]` (`src/domains/communication/webhook.ts`). An item for no
  open connection is not stored.
- **Core never imports a module.** A module's code lives in
  `src/domains/<key>/`, `src/lib/modules/<key>/`, `src/components/modules/<key>/`,
  `src/app/(console)/console/apps/<key>/`; core reaches it only through the hooks
  `check:modules` lists: `<ModuleSlot name="order.side" | "home.tile">`
  (`src/components/modules/slots.tsx`), the outbox cron, the console layout, the
  webhooks. Add a filler to `FILLERS`, not an import to a core page.

## Themes (T0 built 2026-11-08; spec docs/specs/2026-11-08-themes.md)

- A shop's look is **data over one section library**: `src/domains/themes/` (types, `resolveTheme` — the ONE merge
  of manifest → style → the merchant's layer — `contrast`, section SAVE schemas) and
  `src/components/storefront/sections/` (server components). Rendering reads only `ResolvedTheme`.
- **Manifests** are typed files `src/domains/themes/catalogue/<theme>/<semver>.ts`, listed in `catalogue/index.ts`.
  A released file never changes; a new version is a new file. Theme colours live there and nowhere else
  (`check:hex` QUOTED rule).
- **Section schemas change additively only** (a new optional field with a default); a breaking change is a new
  section key. `sections-snapshot.test.ts` fails anything else. Shape lives in the save schema; publish/render
  readiness is a separate pure check (T1).
- **Sources** (`src/domains/storefront/sources.ts`) pick a section's products: pure, listed only, newest by `since`.
  Never by cost or margin (the order reaches the shopper; ADR-0003).
- **check:theme** is a vitest (`src/domains/themes/__tests__/check-theme.test.ts`): manifests are TS. It holds
  styles 1–5, allowed sections, sources, ≤ 20 sections and contrast for every scheme.
- A shop with no published theme renders **Classic from `accent` and `display_font`** (`classicFromSettings`).
- **Any storefront change** runs e2e `05-shop-look` (pixel diff against `e2e/baselines/`); an intended change
  regenerates them in the same commit: `UPDATE_BASELINES=1 npm run e2e -- --only shop-look`.

## Outside world (ADR-0006)

- Outbound: `enqueue(tx, { kind, dedupeKey, payload })`; register a sender for
  the kind in `src/app/api/cron/outbox/route.ts` (move to `src/lib/connectors/<name>/`
  when the first one lands). Every HTTP call: `fetchWithTimeout` (`check:fetch`).
- Inbound: `src/app/api/webhooks/<provider>/route.ts` — read `request.text()`,
  verify the signature on that text, compute OUR key, insert with
  `onConflictDoNothing`, answer 200. Processing reads `webhook_events where
  processed_at is null`. List the route in `scripts/check-actions.mjs` ENTRY_POINTS.
- Per-merchant credentials (Shiprocket tokens, Meta system user tokens) are
  never in env; they go in a tenant table, encrypted — the design is a spec.

## Money (ADR-0004)

Paise everywhere (`src/domains/money/paise.ts`); basis points for rates;
`<Money paise>` to render; `formatInr` groups in lakh/crore. Profit is
`orderProfit()` — never a margin computed inline.

## Config

Server secrets in `src/lib/env.ts`, public values in `src/lib/public-env.ts`,
`CRON_SECRET` in `src/lib/auth/cron.ts` — one reader each, every name in
`.env.example` (`check:config`). The db connection is lazy: a build with no
`DATABASE_URL` still compiles.

## Hosting (ADR-0005)

Vercel `bom1` + Supabase ap-south-1. Storefront routes set `revalidate`;
console routes are dynamic. Cron schedules in `vercel.json` (Hobby allows daily
only; Pro allows more). Migrations: see CLAUDE.md § Deploying.
