---
name: frata-architecture
description: Use when adding a page, route, server action, query, database table, migration, webhook, cron or connector to Frata, or when deciding where code belongs, how tenant isolation and auth are enforced, how money is stored, or how data reaches a component.
metadata:
  version: 2.36.1
  verified: 2026-11-09
  decisions: [ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008]
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

### Definers and platform reads (security review 2026-11-08)

- A new definer is revoked from `public, anon, authenticated` **and
  `service_role`** (Supabase grants it by default privileges; S12).
- No `frata_app` policy has an `app_current_tenant() is null` branch on a table
  that holds shopper data. A platform sweep uses a definer that returns ids only (S4).
- Admin takes tenant ids from forms (it is cross-tenant by role); every Admin
  write still matches `tenant_id` **and** the row id together.

## Auth

- Supabase auth only (magic link, `src/app/login/`). Data never goes through
  supabase-js or PostgREST; `anon`/`authenticated` hold no table grants.
- `getUser()` (or, in the middleware's redirect only, `getClaims()`, which verifies the JWT), never
  `getSession()` (`check:layers`). The member and staff checks always ask `getUser()`.
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
- Staff sign-in needs a second factor (aal2 in `requireStaff`) before outside
  merchants go live; a support visit acts as owner (S5, ADR-0007).

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
  `liveCandidates` (the newest publish of each version, newest first) minus withdrawn versions: derived, never
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
  Undo; Admin's counts use `liveOf` too. The shop's look is `liveOf(cached publishes, versionStates)`: the
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
  then per shop, photos only from our store and this shop's folder (PATH_SHAPE), read capped at 1 MB, WebP checked by
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
  processed_at is null`. List the route in `scripts/check-actions.mjs` ENTRY_POINTS.
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
  the shop. Catalogue refreshes are debounced (P11).
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
  `keptOf` over the groups (`src/domains/orders/kept.ts`, the one ₹-kept helper for Offers and Analytics).
- **Links with tags** come from `shopLink` (`src/domains/analytics/link.ts`) only: URL + URLSearchParams, the shop's
  own origin.
- Erasing an abandoned order strips the click ids (`ERASED_KEYS`); the utm tags stay (owner: keep everything else).

## Money (ADR-0004)

Paise everywhere (`src/domains/money/paise.ts`); basis points for rates;
`<Money paise>` to render; `formatInr` groups in lakh/crore. Profit is
`orderProfit()` — never a margin computed inline.

**Offers (O·1, docs/plans/2026-11-08-offers.md).** Core checkout pricing, not a module
(`check:modules` forbids core importing module code).
- **One engine:** `src/domains/checkout/discounts.ts` — `planOffers` (best per class: product
  (greedy, one per line; Buy X get Y spread over the group by value; a gift line made free, never
  added by the server) → order (highest tier step reached) → thresholds on the bag after it →
  payment, prepaid only), `priceMethod` (the stored `productDiscount` first, then the rest) (spread by value to the
  paise; each line's GST rate on its own discounted piece, **per way of paying**: line tax lives in
  `MethodTotal`, never on `QuoteLine`).
- **One repricer and one writer:** a placed order is priced again only by `amounts.reprice()` from
  its stored lines and `order_discounts` (never today's offers), and written only by
  `lib/orders/reprice.ts writeReprice()` — every money column of the order and its lines together.
  Switch to COD, a capture after a switch and a retry go through them; a retry never reprices.
- **Uses are derived:** `discountUses()`/`fits()` in `src/lib/db/discount-predicates.ts` (with
  `liveDiscountSql`, twin of `offerStatus()`), counted through `discountUseSql`/`usesDiscount`
  (parity-tested). Placement locks every offer the bag could get that has a limit, in id order,
  before counting; an offer over a limit drops out and the shopper gets `changed`.
- **The shopper's read** of offers is `liveOffers()` in `queries/checkout.ts` (terms only);
  `publicQuote` maps offers to named fields (a test proves no id, term, limit or budget leaks).
  Codes: one per order, unique per shop forever, fail-closed per-IP guess limit, one answer for
  every failure. A creator code is a labelled code: matched only when typed (`codeFor`), never
  in the bar (`isNull(label)`), recorded with `via` (link or typed).
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
  (final). ₹ kept: `keptSql` takes off credited taxable and returned goods' cost.
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
