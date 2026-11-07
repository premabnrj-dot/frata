---
name: frata-architecture
description: Use when adding a page, route, server action, query, database table, migration, webhook, cron or connector to Frata, or when deciding where code belongs, how tenant isolation and auth are enforced, how money is stored, or how data reaches a component.
metadata:
  version: 2.3.0
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
- **Undo is a compare-and-set** on the value the action wrote
  (`where confirmed_at = $written and packed_at is null`), refused in words
  when something moved since.
- **One home for SQL predicates.** A state test written in SQL (tabs, counts,
  holds) lives in `src/lib/db/order-predicates.ts` with a parity test
  against `orderState()` on fixtures — never restated in a query.
- **Operational state is a column, not jsonb.** `checkout` jsonb holds
  hypotheses for analysis; anything code branches on (stock taken, per line)
  is a typed column.
- **A definer function that names people takes no ids:** it reads
  `app_current_tenant()` and returns only that shop's members.
- **Snapshot at placement what a document needs later** (seller GSTIN, each
  line's share of charges): a document reads the order, never today's settings.

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
