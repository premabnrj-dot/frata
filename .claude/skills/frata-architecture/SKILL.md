---
name: frata-architecture
description: Use when adding a page, route, server action, query, database table, migration, webhook, cron or connector to Frata, or when deciding where code belongs, how tenant isolation and auth are enforced, how money is stored, or how data reaches a component.
metadata:
  version: 2.49.0
  verified: 2026-11-12
  decisions: [ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0012, ADR-0013]
  covers: ["src/lib/**", "src/middleware.ts", "drizzle/**", "drizzle-analytics/**"]
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

### Definers and platform reads (security review 2026-11-08)

- A new definer is revoked from `public, anon, authenticated` **and
  `service_role`** (Supabase grants it by default privileges; S12).
- No `frata_app` policy has an `app_current_tenant() is null` branch on a table
  that holds shopper data. A platform sweep uses a definer that returns ids only (S4).
- Admin takes tenant ids from forms (it is cross-tenant by role); every Admin
  write still matches `tenant_id` **and** the row id together.

### The analytics database (A·2, ADR-0013, 2026-11-11; plan docs/plans/2026-11-11-guardrails-infra-a2.md § A2·1 as built)

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

## Auth

- Supabase auth only (magic link, `src/app/login/`). Data never goes through
  supabase-js or PostgREST; `anon`/`authenticated` hold no table grants.
- `getUser()` (or, in the middleware's redirect only, `getClaims()`, which verifies the JWT), never
  `getSession()` (`check:layers`). The member and staff checks always ask `getUser()`.
- **One sign-in lookup per request** (2026-11-11): `getUser()` and `app_access_for` go through `src/lib/auth/session.ts`
  (`signedInUser`, `accessOf`, React `cache`), shared by `requireMember`, `requireStaff` and `requireUser`; Admin's
  layout used to ask each twice. `cache` does not memoize inside a server action or route handler: there each call is
  its own lookup (and each `adminDb()` its own connection), so pass the transaction down instead of reading again.
- **Staff passkeys** (ADR-0007 amended 2026-11-12; `docs/specs/2026-11-12-staff-passkeys.md`): staff access and every
  support visit need a live passkey step-up on this browser session. `app_access_for(user, session, stepup hash)`
  answers `staffConfirmedAt` and drops support visits without one, in the query every signed-in request already runs.
  `requireStaff` returns `StaffOk` (with `sessionId`, `confirmedAt`) or `needs_passkey` with a `StaffIdentity` — a
  different type that only `src/lib/admin/passkeys.ts` accepts; Admin's layout renders the check in place of any
  page. Adding or removing staff, approving a request and removing a passkey need `confirmedRecently` (5 minutes).
  The `staff_*` tables have no grant to any role (definers only, `check:tenant`); the session id comes from
  `getClaims()` with `sub` matched; the cookie is `__Host-frrata_staff` (plain `frrata_staff` on the local e2e stack).
- **Secrets only in Production** (previews off production, 2026-11-12): every secret in `src/lib/env.ts` is read through
  `secret()` (`src/domains/infra/stage.ts`): on Vercel, Production only; off Vercel, as given. `check:config` fails an
  unwrapped read. Sign-in is off in the browser on a preview.
- Signing in grants nothing; a `members` row does. Roles: owner, admin, staff,
  partner (`MEMBER_ROLES`); tuples `ANY_MEMBER` (everyone, partner included:
  orders, and products and collections — staff edit the catalogue, owner
  2026-11-08), `CAN_BUILD` (owner, admin, partner: the look and the shop's own
  settings), `CAN_MANAGE` (owner, admin: people, the address, opening the shop),
  `SHIPPERS` (owner, admin, staff: sending parcels), `CAN_SET_COSTS` (owner, admin, partner: shipping costs, then
  `seesCosts`). Payment keys are `['owner']`.
- **Who sees a cost or a profit is `seesCosts(role, hasOwner)`** (owners and admins; a partner only while the shop has
  no owner; staff never; owner 2026-11-08), read through `costsVisibleIn(tx, …)` inside the page's transaction, which
  fails closed (no tenant context reads as "has an owner"). When it says no, the figure is not computed or sent, not
  hidden.
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
  sign-in: it waits for Accept (`app_accept_handover_v2`, 0066), which claims the
  new owner's verified email for the shop's trial or ends it (one trial per business). A partner shop's trial starts at
  creation and it cannot be published until it has an owner (trigger in 0066). A partner's cap counts its
  shops not yet handed over, and a shop with no owner is never billed (`app_shops_to_bill`).
- A layout refuses with a panel, never a redirect (frata-gotchas) — and its
  check guards nothing below it: **every page and action calls
  `requireMember` itself.** It returns `not_configured` rather than throwing
  when the environment is unset.
- **Session cookies:** every `createServerClient` passes `cookieOptions:
  { httpOnly: true, secure: true, sameSite: 'lax' }` with a bounded `maxAge`;
  nothing reads the Supabase session in the browser. A readable cookie turns any
  script on the console origin (the Meta SDK, the look preview) into a stolen
  staff session (`sessionCookieOptions`, src/lib/security-headers.ts). Signed-in console pages
  carry a per-request script nonce (`signedInCsp`, set by the middleware, which REPLACES next.config's
  header of the same name, so it carries the whole policy and X-Frame-Options; e2e 12-security).
- **Route handlers are not server actions:** Next checks Origin for actions
  only. A cookie-authenticated POST route checks `Origin` itself, as
  `requireShop` does. Console and shops stay on different registrable domains.
- **A tuple means what its comment says.** An action whose tuple's comment
  excludes the role it lets through is a finding, not a judgement call (S6,
  settled by the owner 2026-11-08: staff edit products and collections).
- Staff access and every support visit need a passkey step-up on that browser session (S5 closed 2026-11-12, ADR-0007
  amended; § Auth "Staff passkeys"); a support visit acts as owner.

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

**A result goes back to the form, never into a URL or a cookie** (feedback plan 2026-11-12, frata-design-language
§ Feedback). A form that posts to a server action is an `<ActionForm action={…}>` (`src/components/ui/action-form.tsx`);
the action returns `ActionResult` — `{ ok?: string, error?: string, fields?: Record<name, string>, go?: path }` — and
the form shows it (toast.ok / toast.error, `<FieldMessage name>` under each field, `go` followed after the toast). Never
`redirect('?error=…')`: any link could put words there (check:feedback refuses it). Client code that calls an action
itself uses `useToast()` (`toast.error` for a refusal, `toast.ok` or `toast({ text, undo })` for a success), plain
pending state and `settle(router)` after it, never a `useTransition` around the action (frata-gotchas: Next 15.5).

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
  Stock moves only through `src/lib/orders/stock.ts`: `takeStockLines` / `putStockBackLines` (named lines), which the
  order-wide `takeStock` / `putStockBack` call, and `putBackPieces` (a credit note's returned pieces, by quantity).
  Each moves its variants in id order, so two writers never wait on each other in a cycle; a transaction that moves
  stock both ways (an edit's swap) calls `lockVariants` on every variant it touches first. Never an `update variants
  set stock` of your own in an order writer.
- **A sold line is written in one shape** (`lineSnapshot`, `src/lib/orders/lines.ts`), the one place a line's cost is
  read (`unitCosts`; `cogsOf` for the order): placement now, an added or swapped line in an order edit.
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
- **Admin reads tenant data only two ways** (offers O·4): `admin_*` policies plus column grants naming exactly the
  columns Admin needs (it sets only the columns it owns, e.g. `discounts.stopped_*`), or a definer that returns
  aggregates per shop (`app_admin_offer_totals`), never a row a shopper is in. A status Admin shows is derived by the
  same pure function the shop uses (`offerStatus`), never restated.
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
  A module's own page is its `setup` (`/console/apps/<module>`); while the module is on and usable it is listed
  under Apps in the console nav (`src/app/(console)/console/layout.tsx`, foldable; icons `src/components/modules/icons.ts`).
- **"Usable" is decided once**: `moduleAccess(facts, now)` in
  `src/domains/modules/access.ts` (granted by core, plan, add-on or trial;
  switched on; not paused; dependencies usable). Badges and buttons come from
  `offerFor()` (the gallery card's footer, state and filter, the price box and the ONE action: switch, needs, ask,
  plans, interest). Never test a plan feature or an add-on row anywhere else.
- **A money read outside Plan and billing** (Apps A2): it runs inside the page's one transaction (`featuredBillWith`
  in `appsPage`), refuses outside CAN_MANAGE itself (`mayReadMoney`) and on a support visit, fails closed, and its
  importer is named in `scripts/check-billing-read.mjs` with the reason. Type imports count: take a type from the
  caller's return, never from `@/lib/queries/billing`.
- **Every app has a page** (Apps gallery, 2026-11-11): `/console/apps/[app]` renders `AppAbout` (features drawn from
  `src/domains/modules/showcase.ts`, no screenshots); an app with a home of its own is a static folder that renders the
  same `AppAbout` while not usable (static folders win over `[app]`; `app-pages.test.ts` holds it). The gallery and an
  app's page read `appsPage()`: facts, add-on prices and the member's "Tell me when it's ready" rows in ONE
  transaction. `app_interest` is the member's own (session user id, never a support visit); Admin reads it only
  through `app_admin_interest`.
- **Facts**: `shopModules(tenantId, atIso)` (`src/lib/queries/modules.ts`),
  cached per request. Admin reads the same facts through `merchantModules()`
  (`src/lib/admin/modules.ts`) and still derives through `moduleAccess()`.
- **Tables**: `tenant_modules` (the merchant's switch; app inserts and closes),
  `tenant_addons` (app reads; admin inserts and may only set `ends_at`; the shop writes ONLY through the A3 definers
  `app_start_addon_trial` / `app_end_addon_trial` / `app_stop_addon` in `drizzle/0114_addon_trials_access.sql`:
  shop from `app_current_tenant()`, the caller an owner or admin, price the newest and the one shown, times from
  `now()`; `by_shop` marks a self-serve trial and its paid row, one trial per shop and add-on ever), `addon_prices`
  (versions; `(id, module)` keyed so a row's price is its own add-on's), `module_pauses` (platform-wide; one open per
  module). Turn off on a paid add-on stops it (`app_stop_addon`: works to the month's end, never billed after); in the
  shop's own trial it ends both rows. Proof: tenancy checks 29 and 73.
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
  `src/domains/<key>/`, `src/lib/modules/<key>/` (its tables too: `src/lib/modules/reviews/schema.ts`, listed in
  `drizzle.config.ts`), `src/components/modules/<key>/`, `src/app/(console)/console/apps/<key>/`, its shopper API
  `src/app/api/shop/<key>/` and its shop pages in the `src/app/s/[host]/(<key>)/` group; core reaches it only through
  the hooks `check:modules` lists: `<ModuleSlot>` / `<Slot name="order.side" | "home.tile" | "checkout.identity">` (`src/components/modules/slots.tsx`),
  the product page's `productExtras` (`src/components/modules/storefront.tsx`: what goes under a product and its
  rating, from one read; the rating is the markup's `aggregateRating`), the `SENDERS` map (`src/lib/outbox/drain.ts`),
  the console layout, the webhooks. Add a filler, not an import to a core page.
  In the shop's client checkout a module talks through `src/components/storefront/module-events.ts` only: it fills the
  form with a `shop:prefill` event, hears the placed order's address on `shop:placed`, and names the arm it showed in
  sessionStorage `shop:arm:<key>` (EkCode P1).
- **An add-on sold only on some plans** says so in the registry (`addOnFor`, Reviews: Growth and Scale). Off those
  plans an add-on or trial row grants nothing (`addOnAllowed`), Admin offers no trial, and the bill drops it; a plan
  that includes the module stops the add-on's bill too (`addOnBillable`, from the plan at the month's start).
- **A module's cached shop reads** use `moduleCached` (`src/lib/queries/storefront.ts`, still the one wrapper:
  check:tenant 6d) with a scope: `'reviews'` (shop-wide, tag `shop:<t>:reviews`) or `'reviews:product'` (first
  argument the product id, tag `shop:<t>:reviews:<product>`). `refreshReviews(tenant, product, shopWide)` purges:
  a shopper's published review its product only; an owner's action both.
- **One product's cached entry** (`shopProductRow`) uses `shopCached` scope `'catalogue:product'`: tags
  `shop:<t>:catalogue` and `shop:<t>:product:<handle>`. `refreshProduct(tenant, handle)` purges that product only
  (product video, PV·1); a catalogue change still purges them all.
- **Videos** (`videos`, V1) carry `use` (`loop` | `product`), set at insert and never updated (drizzle/0090). Every
  read filters by use: the Look never reads, cancels or releases a product's video. A product's link is
  `product_videos` (one per product, tenant in every key). `mux.rendition.create` (outbox) adds its 720p after the
  checks; the Product video module's `outboxKinds` cancels it when the module is turned off.

## Themes (T0–T3 built 2026-11-08; spec docs/specs/2026-11-08-themes.md, plan docs/plans/2026-11-08-themes.md)

**New values on shared settings (theme Signal, 2026-11-09).** A new value of a setting every theme shares (a card, a
header, a section layout or scheme) ships with a base choice list equal to TODAY's values (`BASE_CHOICES`,
`allowed.productLayouts`, `allowed.sectionSchemes`), so only the theme that lists it can render it; the resolved-looks
snapshot (`__tests__/resolved-looks.test.ts`) fails if any released theme's output moves. A scheme derived from the
merchant's colour (`signal`) is computed at render (`schemeVars`) from the FINAL accent, never stored in a style.
Samples follow what the shop sells (`sampleSetFor`), only in preview routes; every sample file is credited
(`public/themes/samples/CREDITS.json`, `check:credits`). The storefront budget gate sums the layouts above a page.

**A new option on a released version is a new version (Signal 1.1, 1.2, 1.3):** a released manifest never changes
(`released-manifests` snapshot); an optional field (`video`, `script`, `layout: 'spotlight'`) keeps older looks
byte-identical, and resolve drops it where the theme doesn't offer it (`allowed.videoSections`, `imageTextLayouts`,
`heroScript`, `scale`, `productStories`/`pairWith` → `ResolvedTheme.product`). **Section schemas are lenient** (a blank one parses, so autosave never fails); whether it
shows is readiness's, non-blocking for "empty (hidden)". **Two stylesheets (S2-0):** `src/app/shop.css` (Tailwind from
the shop's sources only + `base.css`) is the root's; every non-shop entry adds `globals.css` (the full app sheet)
after it. A class a shop page uses from outside the shop's folders must be added to `shop.css`'s `@source` list;
`check-storefront-build` fails a shop page that loads the app sheet.

- A shop's look is **data over one section library**: `src/domains/themes/` (types, `resolveTheme` — the ONE merge
  of manifest → style → the merchant's layer — `contrast`, section SAVE schemas, `readinessOf`, `carryOver`,
  `baselineRevision`) and `src/components/storefront/sections/` (server components). Rendering reads
  only `ResolvedTheme`; settings reach CSS as `--store-*` custom properties and `data-*` attributes on the shell.
- **Manifests may be authored data (ADR-0012, Theme Studio TS0a).** A manifest from a file or a row is one object:
  `ManifestSchema` (`manifest-schema.ts`: colours exactly `#RRGGBB`, every token a closed choice, photos only from
  Frrata's samples; every code manifest parses to itself) and `themeCheck` (`check.ts`, the one check: vitest for code,
  the studio for data). **Every reader takes a `ManifestSource`** (`source.ts`: `keys()`, `versions(key)`; pure
  `manifestOf(src,…)`/`manifestNear(src,…)`), from `manifestsFor(tenantId)` (`src/lib/themes/manifests.ts`, `cache()`d)
  read **before any transaction** and passed down. Shop pages use `shopTheme(shop)` (`page-look.ts`, once per request).
  Only `source.ts`, Admin's code-version pages and tests read `CATALOGUE` (`check:layers`). Classic 1.0.0 always comes
  from code. **The shop's look cache** (`look-v2`, tag `shop:<t>:look`) holds the publish candidates (one DISTINCT ON
  query, `publishCandidates`, also the console's rule) and the newest body; other bodies are cached by revision id;
  withdrawn versions are a `string[]`. Publish and Undo purge `shop:<t>:look`, never the catalogue. `look.ts` runs inside
  `asMember`: never a cached loader or a second `withTenant` there (`look-p4.test.ts`).
- **Blocks and designs (Theme Studio TS0b; plan `docs/plans/2026-11-11-theme-studio-ts0b.md`).** A theme's `designs`
  are trees of blocks (`blocks.ts`: explicit three levels, design › columns › group › leaf, never `z.lazy`); the owner's
  section `{ key: 'design', design, fill }` fills the blocks the theme marks, **by stable block id, with kind-tagged
  fills** (`FillSchema`, a discriminated union; the record keyed by the id regex, reserved ids refused, read with
  `Object.hasOwn`). `SectionSchema` stays manifest-free; **`resolveDesign(design, fill, 'shop' | 'preview')`** merges,
  and on the shop never yields a theme's sample photo or an `example` (a claim the owner must write: readiness blocks
  Publish). `ResolvedTheme.home` keeps stored shapes; `ResolvedTheme.designs` holds only the designs in use. The save
  (`saveLookAction`) runs `designProblems` after the manifest is read, prunes fills to (id, kind), and refuses a layer
  over 60 kB of JSON bytes in words. `cleanImages` maps every fill by kind (`satisfies never`). A design carries over
  only within its theme (`carryOver`), else a `lost` line names it. Blocks render in
  `src/components/storefront/blocks/` (server only; `check:tenant` 6e: no loader or db import), styled by `.store-b-*`
  rules (≤ 1.0 kB gz, `check-storefront-build`). The tree walk (`design-tree.ts`) has no Zod, for the customizer's
  bundle (gated at 208 kB).
- **Commerce, video and date blocks (TS1b).** A product grid (4 pieces from a `SourceSchema` source; the theme's default
  never a collection), a featured product, collection tiles (≤ 4, `tilesOf`, shared with the section), a video and a
  drop date. They read the Home page's own catalogue and best-sellers ids (`ctx`): no statement, no loader in a block;
  the per-source loader is TS1c's. A fill never holds a video id: a design's one loop is the section's own `video`,
  kept only where the design has exactly one video block and the theme lists `design` in `videoSections`
  (`keepDesignVideo`, in `designsForSave` and `resolveTheme`; `VIDEO_KEYS` includes `design`). The save
  (`designsForSave(designs, home, { now, videoOk, loopsBefore })`) also refuses a 3rd design with pieces or collections
  (`MAX_COMMERCE_DESIGNS`), a look that grows past `MAX_LOOPS` = 3 loops (one already past keeps them: `loopsBefore` from
  the stored draft), and a drop date over 400 days away or unreadable. themeCheck: what only the owner chooses is
  fill-marked; one video a design; a minor can't add pieces, collections or a video to a design already on shops.
- **A loop's MP4 (TS1b, owner 2026-11-11).** A loop uploads with no MP4; past the checks the processor asks for a sized
  one (`loopMp4`: 720p, or the largest size a smaller source fills) and records it in `videos.mp4` (0102–0103: set once)
  in the transaction that enqueues `mux.rendition.create`. `mp4Of(row)` is the one rule for which file plays (a V1
  loop's `highest`, a product's 720p).
- **Eager images.** `ProductGrid`'s `lead` is off unless the caller asks; a page asks for ≤ 2 (`74-commerce` counts
  them on Home, Shop all and a collection). `shopCatalogue` is expanded once a request (`cache()`): never sort it in place.
- **Pages (Theme Studio TS1a; plan `docs/plans/2026-11-11-theme-studio-ts1.md`).** About and FAQ live in `shop_pages`
  (0099–0100: RLS, column grants, ≤ 20 a shop and one FAQ, addresses unique per shop, the cap under the `look:<t>` lock);
  their templates are Frrata's (`src/domains/pages/templates.ts`, TS0b blocks + the page-only FAQ block whose items may be
  **bound** to Settings: `boundAnswer` in `domains/policies/answers.ts` gives the policy's own paragraph, or a link when the
  owner rewrote it). A page's `draft`/`live` are `{ title, handle, fill, hidden }`; **a change reaches the shop only by
  the look's Publish** (`preparePages` in `src/lib/themes/pages.ts`, inside `publishRevision`: live := draft, previous :=
  live, live_publish_id := that publish); Undo swaps them under its own publish row; Discard puts drafts back. The
  handle is fixed once live. **Contact is not a page row**: it is `/policies/contact` (live before a shop opens, for KYC),
  its line in the look's layer (`contact`). The shop reads `shopPages` (cached, tag `shop:<t>:pages`, purged with the look
  at Publish and Undo); drafts only through the uncached `previewPages`. Page photos go through `cleanFill`.
- **Manifests** are typed files `src/domains/themes/catalogue/<theme>/<semver>.ts`, listed in `catalogue/index.ts`.
  A released file never changes; a new version is a new file. Theme colours live there and nowhere else
  (`check:hex` QUOTED rule).
- **Section schemas change additively only** (a new optional field with a default; never a narrower bound); a
  breaking change is a new section key. `sections-snapshot.test.ts` + `fixtures/stored-sections-v1.json` fail
  anything else. Shape is the save schema; what blocks a publish is `readinessOf` (a separate pure check).
- **Sources** (`src/domains/storefront/sources.ts`) pick a section's products: pure, listed only, newest by `since`,
  Best sellers by **delivered units** (`shopBestSellers`: ids only, cached an hour). Never by cost or margin
  (ADR-0003).
- **Looks: `src/lib/themes/look.ts` is the one module that reads or writes them.** Live = `liveOf` over
  `publishCandidates` (the newest publish of each version, newest first; one DISTINCT ON query) minus withdrawn versions: derived, never
  stored; the shop, Look, Undo and Admin all use it. Draft = the newest revision with no publish row, at most one (replaced under the per-shop advisory
  lock `look:<tenant>`). Publishes are append-only; a published revision is frozen by `app_theme_revision_frozen`.
  Saves and publishes lock the row and check its `version`; Undo names the live revision it saw. The first publish
  of a shop with no publish row records its baseline (`baselineRevision`; migration 0034 is its SQL twin).
- **Writes** are `src/app/(console)/console/look/actions.ts` (all `asMember`, a support visit refused). Every image
  in a layer is rebuilt by `acceptedBase(…, 'theme')` for this shop; uploads go to `tenants/<id>/theme/`.
- **Preview** `/console/theme-preview/<revision>/…` (route group `(lookpreview)`, no-store, noindex) is the ONLY
  framed route: SAMEORIGIN + `frame-ancestors 'self'`, only on the console host (`next.config.ts`,
  `framing.test.ts`). The customizer talks to it by `postMessage`, same origin and `e.source` checked.
- **Page settings** (T2: gallery, details, card, desktop columns, collection top) are additive with today's values
  as `PAGE_DEFAULTS`; a manifest may leave them out. A new setting never edits a released manifest.
- **Released manifests never change**: `released-manifests.test.ts` snapshots each manifest's evaluated content (so a
  change in `kit.ts` or a version it builds on fails too) and the list of versions (so a removal fails); a new
  version adds its snapshot on purpose. A missing version renders the nearest earlier version
  of the same theme (`manifestNear`), never another theme.
- **Back in stock** is the database's fact: one trigger (`app_variant_stock_times`) keeps `variants.sold_out_at` /
  `restocked_at` (sold out ≥ 24 h, stop-when-out only) and replaces whatever the app sends. Never set them in code.
- **Theme versions** (T3): code ships a version; Admin decides who may use it (`theme_versions`, platform;
  `theme_version_stages`, per shop). State is derived from dates; recall and withdraw are final (a trigger) and
  Classic 1.0.0 can never be pulled. THE answers live in `src/domains/themes/release.ts`: `availableTo` /
  `latestAvailable` (may a shop start on it) and `liveOf` (the newest publish not on a withdrawn version). Every
  caller asks them through `themeAccess(tx, tenant)` in look.ts: Try, the gallery, Customize, Restore, Publish,
  Undo; Admin's counts use `liveOf` too. The shop's look is `liveFromEntry(look-v2 entry, withdrawn)`: the
  version rows are one global cache (tag `themes`), so a withdraw is one `refreshThemeVersions()`, not a bust per shop.
- **Shop words** (T2): `shop_settings.shop_language` (en/hi); the words Frrata writes on a shop live in
  `src/components/storefront/words.ts`, **server-only**. An island takes the strings it shows as a prop (`buyWords`),
  never the module (`check-client-bundle` fails a chunk holding its Hindi). Domain functions return kinds and data;
  the view words them. Checkout, bag drawer, emails, invoices and policy pages stay English for now.
- **check:theme** is a vitest (`src/domains/themes/__tests__/check-theme.test.ts`): manifests are TS. It holds
  styles 1–5, allowed sections, sources, ≤ 20 sections and contrast for every scheme.
- **2.0 choices** (plan `docs/plans/2026-11-09-themes-three.md`): `FeelSettings` (button shape/motion, card hover,
  entrance, reveal, buy box, phone bar, footer colours, checkout) are additive with today's look as `FEEL_DEFAULTS`.
  **Which values a theme may use is `choicesFor(m, key)`** (`src/domains/themes/choices.ts`), read by `resolveTheme`
  AND the forms: a manifest lists its values in `allowed.choices`; a key it leaves out gets `BASE_CHOICES` (only what
  every 1.x theme had), so a 1.x theme can never render a 2.0 value. A stored layer is read **key by key**
  (`readSettings`): a value this build can't read drops only itself. `carryOver` brings across only what the
  merchant chose (never the old theme's defaults, never Classic's recorded font).
- **Gallery** = `OFFERED` (Editorial, Bazaar, Studio); `CATALOGUE` holds every theme in the build. Classic stays the
  baseline; Atelier lives on inside Editorial 2.
- **Sample pieces** (`src/lib/themes/sample.ts`, data in `catalogue/samples.ts`, photos in `public/themes/samples/`
  from `scripts/themes/make-samples.mjs`) are merged **only** by the theme-preview route, after the preview read,
  when the shop lists fewer than 4 pieces and the manifest has `samples`. Never in a cached read, never on a shop
  (shop hosts are rewritten, so the files can't be served there; `check-storefront-build` fails a shop chunk naming
  them; `sample.test.ts` pins who imports the module). A real product at a `sample-` handle wins.
- **Checkout** has its own route group `(checkout)` with `ShopFrame` (`src/app/s/[host]/_frame.tsx`, shared with
  `(shop)`): Focused = the shell's `focused` (logo + compact legal footer). `(shop)/template.tsx` is the page
  entrance wrapper (server, reads nothing, `display: contents` when off).
- **A section is guarded**: `Guarded` calls the section's own function (Hero({ s, ctx }) …, never <Hero/>) in try/catch (`unstable_rethrow` first); a throw
  leaves it out of the shop and names it in the preview.
- **Look v3**: a manifest says what was made for it (`made: { headers, footers, sections }`, each within its own
  allowed lists: check:theme); the forms and the library read it ("Made for <theme>" first). New designs ship in a
  theme's next minor version (2.1: header `panel`, `overlay`; footer `gram`), never by editing a released one. The
  header and footer pictures come from one catalogue read (`shellNeedsCatalogue` / `shellPictures`). "Over the photo"
  is CSS keyed on the page opening with a full-bleed hero photo (`[data-lead] [data-bleed] img`). A layer's photo may
  be the shop's own product photo (`acceptedBase(…, 'products')` as well as `'theme'`, same tenant only); a photo's
  `focus` is additive. Publish holds "Going live" inside the same transition as the action (≥ 1.3 s), so the
  customizer can't re-render under it; the re-render with no draft is the success popup (published.tsx), over the
  live revision's framed preview. Section search is pure (`searchSections` in sections.ts, tested).
- **Look v4** (owner-approved 2026-11-09, research `docs/research/2026-11-09-look-v4.md`): the layer gains `site`
  (palette of six roles, text styles, icon library + stroke) and `menus` (main / footer / tabs), both in
  `src/domains/themes/site.ts` (pure). Saved through `layerProblems` (siteProblem, menusProblem first, in the
  merchant's words; an unreadable palette is refused) and stored as parsed; read **part by part** (`readSite`,
  `readMenus`: a bad part drops only itself; a stored palette that no longer reads is ignored). Absent = the theme
  exactly: a text style sets CSS only when set (`data-t-<style>` + `--t-*`), the palette paints paper (and the tint's
  accent and buttons) only when set, the default main menu is the collections (`menusOf`). **carryOver:** another
  theme → menus come across, site does not (owner: "Theme's own"); another version of the same major → both.
  Menu links are `shopPath` only (the shop's own pages). **Icons** are data (`src/domains/icons/data.ts`, generated by
  `scripts/icons/build-icons.mjs` from lucide-static (ISC) and @phosphor-icons/core (MIT); NOTICE.md) drawn by the
  server-only `ShopIcon`; client code imports `icons/names.ts` only; a client island gets the rendered element as a
  prop (BagButton `icon`); `check-storefront-build` fails a shop chunk holding icon paths. The theme preview also
  draws `/bag` and `/checkout` (the shop APIs resolve the shop by host, so the console's preview can't place orders).
- **Any storefront change** runs e2e `05-shop-look` (pixel diff against `e2e/baselines/`); an intended change
  regenerates them in the same commit: `UPDATE_BASELINES=1 npm run e2e -- --only shop-look`. Look's state changes:
  `look.int.test.ts` (real Postgres) and e2e `47-look`.

## Writing products (PI·0, 2026-11-12; plan docs/plans/2026-11-12-product-import.md)

- **The editor and the import write a product's sizes through `writeProducts`** (`src/lib/catalogue/write.ts`, inside
  the caller's transaction: the editor one draft, the import a chunk): prices, SKUs, barcodes, cost of goods, and
  sizes removed or returning. Its rules live there, set-based (one read each of handles, SKUs and barcodes; one insert
  per table), never a per-product loop; a new rule for those goes into it, pinned by `save-product.int.test.ts` and
  `write.int.test.ts`. (Other writers keep their own narrow writes: `createProduct`'s starting sizes, stock moved by
  orders.) A lock not had in its 1 s is told as "Someone is buying this product right now" (`lockTimedOut`).
- New products' addresses come from `freeHandles` (`src/lib/catalogue/handles.ts`, one read for the batch);
  `handleFor` writes Indian scripts in Latin letters (`src/domains/catalogue/indic.ts`).

## Catalogue links (Signal S3, 2026-11-09; plan docs/plans/2026-11-09-signal-s3.md)

- **A link between two products is a table with composite FKs**, never an id array: `product_pairs` (tenant_id,
  product_id, paired_id) → products (tenant_id, id) on both sides, so the database refuses another shop's product
  (tenancy.sql §62). The save still selects the ids with an explicit tenant and refuses unless every one is found
  (`savePairs`, one message for "not yours" and "missing").
- **Content that belongs to one product lives on it** (`products.stories` jsonb, like `label`): Zod caps by
  characters (`domains/catalogue/stories.ts`), a looser CHECK by bytes in the database.
- **A photo a second place uses joins the in-use check:** `editPhoto` keeps the files while a look's settings or any
  product's stories mention the base. A story photo is rebuilt with `acceptedBase(…, 'products')` on every save.
- **The shop reads a page's linked pieces inside its own entry** (`coreProduct`: ≤ 2 pieces, variants, first photo,
  in the same round; drafts never), tagged `catalogue` so a linked piece's change purges the page; which ones show,
  at what price, Add or Choose, is one pure rule (`domains/storefront/pairs.ts`).

## Search and sharing (S·1, 2026-11-09; spec docs/specs/2026-11-09-seo-and-sharing.md)

- **One writer of a shop page's tags**: `pageTags` (`src/domains/seo/tags.ts`, pure), mapped to Next metadata by
  `src/app/s/[host]/_meta.ts` (`shopTags`, `toMetadata`). No shop route builds tags by hand. `description` is always
  set (null clears it): an unset key inherits the root layout's — Frrata's own words on a shop's card.
- **og:type product and product:* tags** render as property= meta in the product page (`ProductTags`); React hoists
  them into the static head only while nothing above the page suspends — no loading.tsx there.
- **The offer** a page and its card state is `offerFor` (`src/domains/seo/tags.ts`): the lowest price a shopper can
  buy at now, with that size's availability; `compareAt` is the struck before-cut price.
- **Share cards** `src/app/s/[host]/og/[...card]/route.ts`: canonical paths only (`parseCardPath`), the host's shop,
  ids found in its cached catalogue (listed products only — a random id costs no query), drawing budgeted per caller
  then per shop, photos only from our store and this shop's folder (PATH_SHAPE), read capped at 1 MB, WebP or JPEG checked by
  sharp, reaching Satori only as data URIs. CDN a day; a stale address shows the current card for 5 minutes. No Blob
  storage (a deleted photo would outlive the product).
- **Old addresses are history rows, append-only** (`product_handle_history`, `collection_handle_history`: select +
  insert for frata_app, cascade with their row). A rename appends the old handle; another row's old handle is refused
  ("uses (or used)"); going back to one's own needs nothing (the current handle is looked up first). Collections'
  old → current map rides in the cached catalogue entry (`movedCollections`); the route 308s before its 404.
- **Identifiers**: `variants.gtin` (check digit in `src/domains/catalogue/gtin.ts`); the MPN in markup is the SKU, never
  a second column. Like the SKU, the gtin is dropped from the cached catalogue entry (only the product page reads it).

## EkCode (P1 built 2026-11-09; ADR-0009, ADR-0010; plan docs/plans/2026-11-09-ekcode-p1.md)

- **A second public host.** `NEXT_PUBLIC_EKCODE_HOST` (ekcode.in) is a `routeFor` kind of its own
  (`src/domains/tenancy/host.ts`): only `/`, `/privacy`, `/terms`, `/contact`, `/continue`, `/api/ek/*` and `/_next/*`
  answer there; `/ek` and `/api/ek` are a 404 everywhere else; it is never a shop (`requireShop` refuses it) and never
  the console (no Supabase session). Its pages are `src/app/ek/` reached through the rewrite; `/continue` gets a nonce
  CSP from the middleware's ekcode branch.
- **Platform tables with no door but definers.** The vault (`ekcode_*`, drizzle/0088): `revoke all` from every role, one
  `restrictive` `definer_only` policy `using (false)`, definers pinned to `search_path ''` and executable by exactly one
  role; `check:tenant` fails any table grant on them. Scope always comes from a server-made handle (the shop's own
  request makes the flow), never from an argument a caller chooses. No definer returns an account id; a shop's id for
  a shopper is a random `ekcode_pairs` row.
- **The handshake** is PKCE: the shop keeps `state.verifier` in its own cookie, ekcode.in gets only a random handle,
  the return URL is built from the flow row, the grant is a 60-second one-time code stored as a hash, and redeem
  checks tenant, host and `S256(verifier)` in one update. Copy this for any cross-host return.
- **Keys that rotate**: `src/lib/crypto/key-ring.ts` — rings "id:secret,…" newest first, the key id inside every
  sealed value and keyed hash; new entries go in front, old values still open. Payment secrets stay on secret-box.
- **A module never imported by core**: the checkout gains a slot (`checkout.identity`) and generic window events
  (`shop:prefill`, `shop:placed`); a brand mark ships as server-rendered SVG, never as path data in a client chunk.
- `src/domains/ekcode/` belongs to the module (check:modules); shared rules are `src/domains/ekcode-core/`.

## Outside world (ADR-0006)

- Outbound: `enqueue(tx, { kind, dedupeKey, payload })`; register a sender for
  the kind in the `SENDERS` map, `src/lib/outbox/drain.ts` (move to `src/lib/connectors/<name>/`
  when the first one lands). Every HTTP call: `fetchWithTimeout` (`check:fetch`).
- Inbound: `src/app/api/webhooks/<provider>/route.ts` — read `request.text()`,
  verify the signature on that text, compute OUR key, insert with
  `onConflictDoNothing`, answer 200. Processing reads `webhook_events where
  processed_at is null`; Razorpay's are retried every 5 minutes by `/api/cron/drain`, the rest by the daily cron. List the route in `scripts/check-actions.mjs` ENTRY_POINTS.
- Per-merchant credentials (Shiprocket tokens, Meta system user tokens) are
  never in env; they go in a tenant table, encrypted — the design is a spec.
- A webhook caps its body before parsing (`raw.length > N` → 413) and checks the
  signature before any database read the secret allows (S13).
- Once processed, a webhook row keeps only what reconciliation needs (event,
  object id, amount, status). Shopper fields (email, contact, VPA) are dropped
  then, never kept (S4; WhatsApp already does this in `webhook.ts`).
- A provider base URL from env (`*_API_BASE`) is refused in production unless
  it is the provider's own host.
- Logs carry an error's `name` or code, never the raw error. A drizzle error
  includes its parameters, so emails and phones end up in Vercel logs (S10).
- **Background work is sized, not hoped.** Batch × runs per day covers 10× peak
  with the number written in the spec. The 5-minute cron is the safety net: a
  sender drains right after `enqueue` (`after()`; one drain per instance at a time,
  a call during one asks for up to two more passes), loops `claimDue` until empty
  or out of time, and shops run with bounded concurrency (`src/lib/outbox/drain.ts`:
  `drainSoon()` after the commit, `drainOutbox(deadline)`, `eachLimited`). `/api/cron/drain`
  drains every 5 minutes (Pro, 2026-11-11), so `enqueue({ notBefore })` rows and retries
  go on time. The claim and every settle run through definers (`app_outbox_claim`,
  `app_outbox_settle`, drizzle/0096): no outbox row is readable without its shop set.
  A sender throws `GiveUp` (dead at once), `Later(code, minutes)` (wait, no attempt
  spent: a 429, a tenant not ready) or a plain `Error` (counted; dead at 8). Payloads are
  ids only; errors are our codes, never a provider's words (they can quote an address).

## Speed (review 2026-11-08; findings P1–P15 in `docs/research/2026-11-08-performance-security-motion-review.md`)

Budgets. Each says whether a gate holds it yet:

| Budget | Held by |
|---|---|
| Shop first-load JS ≤ 120 kB gz | `check:storefront-build` |
| Every shop route ISR; second visit HIT | build + `check:payload` |
| Console/Admin first-load JS ≤ 150 kB gz (customize ≤ 190) | review (a gate to add) |
| Largest shop page HTML ≤ 300 kB raw, RSC ≤ 150 kB; lists paged | lists page at 48 (`PAGE_SIZE`, `/products/page/N`, e2e 13-paging); HTML bytes a review |
| A cached loader entry ≤ 1 MB (Next refuses > 2 MB, silently) | `catalogue-size.int.test.ts` (880 kB at 600 products with an offer; `src/lib/storefront/catalogue-entry.ts`) |
| A cold shop page ≤ 12 statements, none repeated | review (loaders are `cache()`d since P3) |
| No preloaded font and `priority` only on the first section's photos | review (P6, P15 fixed) |
| Console page < 1 s p95; a query < 100 ms at the 10× seed, no seq scan on `orders` | review + EXPLAIN |
| **Named exception:** Analytics' window aggregate (one grouped read of a period and the one before) is held to the page's 1 s, not 100 ms (the timings at 10× live in the test's header) | `analytics-speed.int.test.ts` (`SPEED=1`) |

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
  uses up (`usedUp`) purges the same way: the bar (`shopAnnouncement`) is tagged catalogue with the showcase.
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

## Attribution (Analytics A·1, 2026-11-08)

- **Raw in, classified on read.** The shop shell's capture island (`CaptureAttribution`, never in a console preview or
  the Look preview) keeps the landing's tags and the referrer's hostname; `/api/shop/orders` cleans them
  (`cleanAttribution`) into `orders.checkout.attribution`. Nothing stores a classifier output; the one rule is
  `classifySource` (`src/domains/analytics/source.ts`), so a better classifier re-reads history. A reader of stored
  orders (Analytics, a source's page, the order's "Came from") takes the inputs with `attributionInputsSql`
  (`src/lib/db/attribution-sql.ts`) and the creator with `creatorCodeJoinSql`, and classifies with `sourceOfInputs`:
  one route, so they never disagree (an int test checks the order page against Analytics). A creator's code the order
  uses (a labelled `discount_codes` row) wins over tags.
- **Read grouped, never per order:** Analytics groups orders by their raw inputs in SQL (`src/lib/queries/analytics.ts`)
  inside one transaction with `jit off`, `statement_timeout 3s`, `work_mem 64MB`; ₹ kept after returns is
  `keptOf` over the groups (`src/domains/orders/kept.ts`, the one ₹-kept helper for Offers, Analytics and True Profit).
  True Profit (`src/lib/queries/true-profit.ts`) groups LINES: each carries its taxable share of its order's money
  (`share`, which scales a per-parcel estimate) and its own COGS; a credit note that names a line comes off that line,
  one that names none is spread by share; a line's cost counts only when its order's COGS is known (so products add up
  to the order total). PIN codes group orders, with a figure only from 5 orders of that payment kind.
- **Links with tags** come from `shopLink` (`src/domains/analytics/link.ts`) only: URL + URLSearchParams, the shop's
  own origin.
- Erasing an abandoned order strips the click ids (`ERASED_KEYS`); the utm tags stay (owner: keep everything else).

## Delivery (Delivery Zones, built 2026-11-12; plan docs/plans/2026-11-12-delivery-zones.md)

- **`resolveDelivery(pin, floor, setup)` (`src/domains/delivery/resolve.ts`) is THE delivery rule**: the charge, free
  above, pay on delivery and the days for a PIN code. Checkout's quote, placement, the switch to COD (`reprice`), an
  address change on a COD order (`src/lib/orders/work.ts` editContact) and the storefront PIN check all read it; nobody
  re-decides COD or a charge. Pay on delivery for a bag is `codOn(amount, terms)`, the charge `chargeOn` (`floor.ts`).
- **The floor** (Settings' one charge, COD rules, no-COD list) always applies; zones and PIN code rules apply only while
  the app is usable. `deliveryIn(tx, tenant, pin, now)` (`src/lib/queries/delivery.ts`) reads them INSIDE the caller's
  transaction and returns `setup: null` when there are no zones or the app isn't usable.
- **Browser code imports `floor.ts`, never `resolve.ts` or `presets.ts`** (the presets stay on the server).
- **Presets match by 3-digit PIN prefix**, never by India Post's district names (`presets.ts`, versioned).
- **Tables** `delivery_zones`, `delivery_zone_pins` (key `(tenant_id, zone_id)` → zones: a foreign-key check skips row
  policies), `delivery_rules`, `shop_holidays`: tenant rows for `frata_app` only (0112–0113, proof 72). ≤ 50 zones,
  ≤ 5,000 PIN codes and ≤ 5,000 rules a shop, counted under the shop's `tenant:delivery` lock.
- **While the app is usable Settings leaves its fields to it** (`HELD_BY_ZONES`, `src/domains/delivery/lists.ts`):
  the form hides them and `saveSection` drops them. Only zone and dispatch writes purge the shop's cache.

## Photos (2026-11-12)

- **One format per photo, said by its stored base** (`src/domains/media/sizes.ts`): WebP (`<id>` → `<id>-<w>.webp`, every
  photo before this date) or JPEG where the browser makes no WebP (Safari: a `.jpg` base, `<id>.jpg` → `<id>-<w>.jpg`).
  No column: `formatOf(base)`. A file's URL is built only by `urlFor` (never `${base}-${w}.webp` by hand); the upload
  path by `blobPath`; the token allows exactly the type the path's extension says; `photosAreMade` reads each file's
  first bytes against its base's format (`headIs`).

## Razorpay keys that stop working (2026-11-12)

- A call with a shop's keys (`createOrder`, `orderPayments`) that Razorpay answers 401/403 sets
  `payment_keys.problem` to `KEYS_REFUSED` (Settings: "Needs attention"); a call that works clears that problem only.
  `noteKeysAnswer` (src/lib/payments/keys.ts) runs after the call, with no transaction open, and writes only when the
  problem changes, matching the key id the call used. No needs-you notice yet: `notices.source_kind` has no kind for it
  and `notice_write` is not granted to frata_app.

## Money (ADR-0004)

Paise everywhere (`src/domains/money/paise.ts`); basis points for rates;
`<Money paise>` to render; `formatInr` groups in lakh/crore. Profit is
`orderProfit()` — never a margin computed inline. A price typed in the catalogue (the product editor, collection rules), a part credit
note's amount and a price in an import are read by `parseRupees` (`src/domains/money/rupees.ts`): a misplaced comma, a
third decimal, zero or a negative is null (an error), never guessed and never 0. A new rupee input uses it too; the
Look's controls, Settings' shipping costs and sections, and Admin's custom plan price still strip ₹ themselves.

**Offers (O·1, docs/plans/2026-11-08-offers.md).** Core checkout pricing, not a module
(`check:modules` forbids core importing module code).
- **One engine:** `src/domains/checkout/discounts.ts` — `planOffers` (best per class: product
  (greedy, one per line; Buy X get Y spread over the group by value; a gift line made free, never
  added by the server) → order (highest tier step reached) → thresholds on the bag after it →
  payment, prepaid only), `priceMethod` (the stored `productDiscount` first, then the rest) (spread by value to the
  paise; each line's GST rate on its own discounted piece, **per way of paying**: line tax lives in
  `MethodTotal`, never on `QuoteLine`).
- **Each way of paying gets its best** (shop stress test 2026-11-11): when the best order offer does not combine,
  online also tries the best one that does (or none) with the saving (`plan.online`), taken by `quote()` only at a
  LOWER prepaid total (a tie keeps the order offer); on delivery always keeps the best order offer; one delivery charge
  for both. Placement stores `keptOffers(q, method)`: placed online with two order offers, `order_discounts.method`
  marks them 'prepaid' and 'cod', so `reprice()` prices either way, and uses follow the row's way (`offerWay`;
  `discountUseSql(now, 'both' | 'prepaid' | 'cod')`; a hold holds both).
- **One repricer and one writer:** a placed order is priced again only by `amounts.reprice()` from
  its stored lines and `order_discounts` (never today's offers), and written only by
  `lib/orders/reprice.ts writeReprice()` — every money column of the order and its lines together.
  Switch to COD, a capture after a switch and a retry go through them; a retry never reprices.
- **An order's own offers on new lines** (an order edit): only `replanKept()` (`src/domains/checkout/replan.ts`), from the terms
  `order_discounts` kept (0110: every tier step, Buy X get Y, the gift, the products covered; `termsCopy` writes them at
  placement and `storedTerms` reads them, `src/domains/checkout/kept-terms.ts`). Never `planOffers` with today's
  offers, never a new offer; one that gives nothing comes off; free delivery that comes off adds back what it waived.
  A product offer on a row placed before 0110 (`targets` null) has no known terms: `storedTerms` gives null, and the
  caller must not re-plan that order. A new term on an offer is copied in `termsCopy` (a typed column) the same day.
  `storedTerms` takes the row's `code_id` as `code`: a tie between product offers goes to the automatic one, as at
  placement (`productPass`, shared with `planOffers`).
- **Uses are derived:** `discountUses()`/`fits()` in `src/lib/db/discount-predicates.ts` (with
  `liveDiscountSql`, twin of `offerStatus()`), counted through `discountUseSql`/`usesDiscount`
  (parity-tested). Placement locks every offer the bag could get that has a limit, in id order,
  before counting; an offer over a limit drops out and the shopper gets `changed`. The cached pages (bar, cards,
  product lines) leave out an offer `usedUp` for everyone (`usedUpIds`: total limit or budget; never per phone).
- **A percentage saving is whole rupees, rounded down, once per offer** (`wholeRupees` in discounts.ts; 100% exact):
  never a ₹949.05 total, never ₹1 or more short. Stored amounts are what reprice() reads, so placed orders keep theirs.
- **The shopper's read** of offers is `liveOffers()` in `queries/checkout.ts` (terms only);
  `publicQuote` maps offers to named fields (a test proves no id, term, limit or budget leaks).
  Codes: one per order, unique per shop forever, fail-closed per-IP guess limit, one answer for
  every failure but `'beaten'` (a real code a better offer of its class beat: told so, not a wrong guess). A creator
  code is a labelled code: matched only when typed (`codeFor`), never in the bar (`isNull(label)`), recorded with `via`
  (link or typed) — only when it applies: a beaten code is not on the order (no column for it yet).
- **First order** is decided at placement under a per-phone advisory lock (standing or holding
  order from that phone), and again on a payment retry.
- **Did it make money?** `offerStats` (queries/discounts.ts) is the ONE computation of an offer's results:
  window orders that use it now (`useOfRowSql`), state through `stateSql`, ₹ kept through profit.ts with freight from
  `freightOf` (domains/orders/freight.ts: Shiprocket actual or pending — pending left out — else the shop's confirmed
  estimate, `estimateOf(shipCostsIn)`, else none; `keptBasis` says which; computed only for owners and admins), new vs repeat
  through `priorOrderSql` (also the first-order rule), each creator code's week through `leakOf` (domains/checkout/
  leak.ts). Nothing stored. Uses for limits and budgets stay `discountUses` (all time).
- **Stopped by Frrata** (O·4): `stopped_*` makes an offer `stopped` in `offerStatus` and not live in
  `liveDiscountSql`; the shop can only end it (every console WHERE has `stopped_at is null`, except End). At most
  `MAX_RUNNING_OFFERS` (20) run per shop: `runningOffers` counts under the shop's offers advisory lock, read by a
  start and by Admin's resume.
- **Prior price** is derived from `price_history` (`priorPriceSql`, `lib/db/price-predicates.ts`):
  the lowest price in the 30 days before the current one took effect, shown only within 30 days
  of the change. `variants.compare_at` is the M.R.P. (`mrp`), never a struck price.

## GST (plan docs/plans/2026-11-09-gst-core-and-categories.md, built 2026-11-09)

**The split.** GST in the **core** is always on and correct at the source: rates, invoices, credit notes, Settings ›
Taxes, Products › HSN codes — every shop, every plan. The **GST app** is the module `gst` (registry; billing `plan`:
Growth and Scale, owner 2026-11-09), at `console/apps/gst/`, shown in the nav only when usable, its writes and export
through `asModule('gst', …)`, the Accountant's invite too (removing one works with GST off). It only READS the documents as issued (`invoice()` / `creditNote()` in `domains/orders/documents.ts`)
— it never edits a document and never recomputes a tax head.
- **The rate:** `domains/tax/rates.ts` `RATE_TABLES` — dated (`from`), matched by the longest HSN prefix, the ₹2,500
  per-piece slab (after discounts) for chapters 61–64. The date is the order's `placedAt`, never the clock (`taxOrder`,
  `rateFor` take it). An unknown HSN is never guessed: the merchant's own rate (`products.gst_bps`) or the line is not
  sellable for a registered shop (quote 'gone'; publish refused). A new rate is a new dated table, never an edit.
- **Who charges:** `chargesGst({ gstin, scheme })` only — regular with a GSTIN. Composition: bill of supply with the
  declaration. Unregistered or composition: delivery within `home_state` only (s.24), at placement too.
- **B2B:** `b2bProblem` (checksum + the GSTIN's state = delivery state), no autofill; buyer fields freeze with the invoice
  (`app_buyer_fixed` trigger); off at ₹5 crore and above until e-invoicing.
- **Credit notes:** `domains/orders/credits.ts` (what is left of each line; return pro rata by quantity, discount by value
  at each line's rate, goodwill no GST in its own G series, reversal takes the rest), lines in `credit_note_lines`
  (final). ₹ kept: `keptSql` takes off credited taxable (`creditedSql`) and the cost of pieces a return put back in
  stock (`cogsSql`). A return restocks only when ticked: `issueCredit`, same transaction, `restockOf` (never past what
  the line sold less earlier restocks), recorded once in `credit_note_lines.restocked_qty`. A return that CAME BACK
  (RTO) loses its COGS unless its came-back event put the stock back (`rtoRestockedSql`, grouped by keptSql and
  Analytics alike; frata-unit-economics).
- **GSTR-1:** `domains/tax/gstr1.ts` from the documents; files in `gstr1-files.ts`; the period read is
  `queries/gst.ts gstPeriod(In)`, never cached. Filing (G2): `lib/gst/gsp.ts` (`gsp()` null = off; the fake never in
  Production), the actions in `console/gst/actions.ts` write a `gst_attempts` row before each call (ADR-0008, accepted 2026-11-09),
  `gst_filings` is final once filed (trigger).
- **The Accountant** (`MEMBER_ROLES`): in `CONSOLE_ROLES` and `CAN_SEE_GST` only — never add it to an existing role tuple;
  `seesCosts` is false. Invited by the owner through the `app_*_accountant` definers.

## Config

Server secrets in `src/lib/env.ts`, public values in `src/lib/public-env.ts`,
`CRON_SECRET` in `src/lib/auth/cron.ts` — one reader each, every name in
`.env.example` (`check:config`). The db connection is lazy: a build with no
`DATABASE_URL` still compiles.

## Trials (TR0 built 2026-11-08; spec docs/specs/2026-11-08-trials.md, plan docs/plans/2026-11-08-trials.md)

- **Terms are frozen into the shop's row when they apply.** Admin's `trial_settings` are for NEW sign-ups; a shop's
  `shop_trials` row keeps the length and window it started with, so a later change never moves a running trial.
  Do the same for any setting that changes terms (a price, a length, a limit).
- **One writer of a derived-but-stored fact.** `tenant_plans.trial_ends_at` (what billing reads) is written only by
  `app_trial_recompute` (drizzle/0063: security invoker, revoked from every role, locks the tenant, touches the row in
  force and later rows only). Every change calls it — the first-publish trigger, every insert into `tenant_plans`, the
  extension, Admin's set / extend / end. Its SQL day rule (`app_ist_day_end_after`) is held to
  `src/domains/plans/trial.ts` by a parity int test.
- **The trial begins once the website is live** — the first `published_at` only; closing and reopening never restarts
  it. A support visit never opens or closes a shop with a running trial (it would start the clock for good).
- **The state is derived, never stored** (`trialState`); every trial end is the end of an IST day, stored as the first
  moment of the next (exclusive) — show it with `lastDay()`, never `dayIN(trialEndsAt)`.

## Hosting (ADR-0005)

Vercel `bom1` + Supabase ap-south-1. Storefront routes set `revalidate`;
console routes are dynamic. Cron schedules in `vercel.json`: legacy `crons` are daily on Hobby,
per minute on Pro; Vercel Schedules (public beta 2026-11-05) allow every 15 min on Hobby within 5,000 runs a billing
period (frata-integrations § Domains). Build for daily; a beta schedule is an option, not a dependency. Migrations: see CLAUDE.md § Deploying.

## Shop websites as code: kit and fleet rules (owner-approved 2026-11-12; spec docs/specs/2026-11-12-kit-and-fleet.md)
Nothing here is built yet; these bind every spec and plan for Sites, Studio and the kit.
- **Domains.** Partner or agent code runs only on its own registrable domain on the Public Suffix List (placeholder
  `frrata.site`), previews on another. Never on `frrata.shop` (checkout, sign-in), never on the console's, Admin's or
  Studio's domain. A spec that puts site code beside checkout's origin is a blocker.
- **Build mode.** A shop that has never had an owner (`clientStage`: building or invited) publishes without approval,
  to the signed preview only; its public address stays "Opening soon" with `noindex` until the owner opens it. Handover
  re-runs the checks and binds the owner's accept to a deployment id; a shop that ever had an owner never returns.
- **One record.** Publish, patch, rollback and handover all write `site_deployments`; live, held and drift are derived
  from it. Requests out through the outbox (`site.build`, `site.promote`); results back through `webhook_events`.
- **No fleet key.** Each site builds with its own storefront key; no key, role or token reaches every shop's data.
  The fleet service is deterministic code in the hosting account, never an AI agent with deploy rights.
- **Controls apart from code.** Policies live in their own repository, served as signed JSON by version; the publish
  gate runs Frrata's pinned checks on the build output, never the site's copy; a hard floor (no `unsafe-eval`,
  `connect-src` Frrata only, `form-action` checkout only, no route handlers or server actions in site code) is tested
  in this repo and no policy can lower it.
- **Facts stay in the API.** Money, offers, prior prices, JSON-LD, brand tokens and the legal block's words are served
  by the API, never re-implemented in a kit package.
- **Agents never approve** a release, a policy, a takedown or a publish.
- **Checkout stays home.** Checkout, sign-in and order pages stay on Frrata's own host in Mumbai; a site's router
  carries page requests only.
