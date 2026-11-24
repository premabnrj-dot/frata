---
name: frata-architecture
description: Use when adding a page, route, server action, query, database table, migration, webhook, cron or connector to Frata, or when deciding where code belongs, how tenant isolation and auth are enforced, how money is stored, or how data reaches a component.
metadata:
  version: 3.20.1
  owner: owner
  verified: 2026-11-23
  decisions: [ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0012, ADR-0013, ADR-0015, ADR-0018, ADR-0020]
  covers: ["src/middleware.ts", "src/lib/db/tenant.ts"]
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
  **The Storefront API's host** (ADR-0018, V1 SA0): `storefrontKeyFor(key)` (`src/lib/queries/storefront-keys.ts`), called
  only inside `apiRequest()` (`src/lib/storefront-api/request.ts`), from the key in the path through the definer
  `app_storefront_key`. **These are the only three sources of a tenant id.**
- **The Storefront API** (ADR-0018; plan `docs/plans/2026-11-15-v1-storefront-api.md`): its host `NEXT_PUBLIC_API_HOST`
  is a `routeFor` kind of its own, rewritten by next.config (`apiRewrites`; never the middleware, whose matcher skips
  versioned paths). Live keys (`frs_pub_`) reach the cached tree `api/storefront/<v>/k/`, test keys (`frs_test_`) the
  dynamic tree `t/`, build keys (`frs_build_`, G·2) only in the `Frrata-Key` header the dynamic tree `h/` (no CORS, looked
  up uncached, minted only by `mintBuildKey`). G·3's device sign-in mints inside the store a definer names for a
  confirmed code (`app_device_code_claim`: a members row of the person who confirmed it, re-read at the claim), never a
  store from the request: not a fourth source, the person's own membership (tenancy audit 2026-11-22). **A cached route handler never reads the request** (a header read is a runtime error there, and
  anything per-caller would be served to everyone); CORS there is a static `*`. Every handler is
  `export const GET = apiRequest({ version, tree, mode, resource, schema, run })`: `run` gets `ctx` (shop, key, kind,
  version, now) and parsed path params, never the Request; its answer leaves as `schema.parse()` of a closed schema.
  The key lookup is cached and tagged by the key's sha256 hex (`skey:<hex>`: an `unstable_cache` tag must be known
  before the call); every stop (deleted, expired, store opened for test keys, partner gone, domain gone, back to
  Frrata) is derived in the definer. `check:tenant` § 9 and `check:api` hold the shape; proof block 81 the database.
- Console writes go through `asMember(roles, (tx, ctx) => …)`
  (`src/lib/auth/as-member.ts`): it opens the tenant transaction and, in support
  mode, writes the audit row in the same transaction (`check:actions`).
- **Admin** (ADR-0007): `requireStaff(roles)` first; reads and writes through
  `src/lib/admin/*` functions that take `StaffOk` and use `adminDb()` as
  `frata_admin`. Never `withTenant` in Admin. A new table states its
  `frata_admin` grants in the same migration (often: none).
- **Admin › Today and the nav counts** (Neel N4): `TODAY_SOURCES` (`src/domains/admin/today.ts`) names each source,
  its area and the roles that see it; a source is read only for those roles (filter before reading). Each source reads
  a count or a short list on an index (never a page's whole list); one gather per person per request (`todayItems`,
  React cache keyed by user id), shared by the layout and the page, as plain parallel reads, never a transaction
  holding one of Admin's two connections. A source that fails is logged and left out ("uncounted", never 0); the nav
  waits at most 1.5 s, then shows no counts. EkCode, Email and Infrastructure have no source (their reads take seconds).
- **Admin › Costs** (2026-11-23, drizzle/0172, proof § 102, `check:tenant` § 10): platform tables only `frata_admin`
  touches; every export re-checks `ADMIN_ONLY` — [reference/money-and-gst.md](reference/money-and-gst.md) § Admin › Costs.
- **Money in Admin needs a fresh passkey** (`confirmedRecently`): Issue, Record payment, Credit note, Record refund.
  `frata_admin` only reads `frrata_payments`; the refund is written by `app_record_frrata_refund` (0138), once.
- **Activity** reads named columns only (never `detail`), 50 a page on the `(at, id)` keyset with the row comparison,
  filters through zod, and hides `billing.*` rows from support staff on the server (`src/lib/admin/activity.ts`).
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
- **A definer's new version is expand-then-contract** (O1, 2026-11-23): add vN+1 in a migration applied before the push
  and move the app to it; drop the old in a migration whose first line is `-- apply: after-live`, applied only once the
  new build serves and the old functions have run out. A rollback past the drop re-creates the old functions WITH their
  revoke/grant (`docs/setup.md` § Sign-up definers); previews share the database, so open branches move first.

## Auth

- Supabase auth only (an email code, and a link that opens `/auth/confirm`, which signs in only when the person presses
  Sign in: an email scanner that follows it uses nothing; `src/app/login/`, `/partner/sign-in`). Data never goes through
  supabase-js or PostgREST; `anon`/`authenticated` hold no table grants.
- `getUser()` (or, in the middleware's redirect only, `getClaims()`, which verifies the JWT), never
  `getSession()` (`check:layers`). The member and staff checks always ask `getUser()`.
- **One sign-in lookup per request** (2026-11-11): `getUser()` and `app_access_for` go through `src/lib/auth/session.ts`
  (`signedInUser`, `accessOf`, React `cache`), shared by `requireMember`, `requireStaff` and `requireUser`; Admin's
  layout used to ask each twice. `cache` does not memoize inside a server action or route handler: there each call is
  its own lookup (and each `adminDb()` its own connection), so pass the transaction down instead of reading again.
  A door that asks several checks in one call wraps them in `oncePerCall` (`session.ts`, an AsyncLocalStorage memo of
  `signedInUser`, `sessionIdOf` and `accessOf` for that call only): `requireStudio` does, so a poll asks once, not three
  times (2026-11-23).
- **Staff passkeys** (ADR-0007 amended 2026-11-12; `docs/specs/2026-11-12-staff-passkeys.md`): staff access and every
  support visit need a live passkey step-up on this browser session. `app_access_for(user, session, stepup hash)`
  answers `staffConfirmedAt` and drops support visits without one, in the query every signed-in request already runs.
  `requireStaff` returns `StaffOk` (with `sessionId`, `confirmedAt`) or `needs_passkey` with a `StaffIdentity` — a
  different type that only `src/lib/admin/passkeys.ts` accepts; Admin's layout renders the check in place of any
  page. Adding or removing staff, approving a request and removing a passkey need `confirmedRecently` (5 minutes).
  The `staff_*` tables have no grant to any role (definers only, `check:tenant`); the session id comes from
  `getClaims()` with `sub` matched; the cookie is `__Host-frrata_staff` (plain `frrata_staff` on the local e2e stack).
- **Passkeys off** (owner 2026-11-23, drizzle/0171): a master admin turns passkeys off for everyone on Admin › Staff
  (`app_admin_passkeys_set`, their own passkey in the last 5 minutes; on needs none). While `app_passkeys_off()`, every
  definer that follows `app_partner_need` or a staff step-up counts this sign-in as checked; passkey lists, adds and
  removals keep the real check, so their screens say "Passkeys are off". Read the state through `passkeys()` (`session.ts`).
- **Partner passkeys** (T1b, 2026-11-15; `docs/specs/2026-11-15-partner-login.md`, drizzle/0128–0129): the same design
  for partner people. `app_access_for(user, session, staff hash, partner hash)` counts a `members` row with a
  `partner_member_id` only with a live partner step-up (answers `partnerConfirmedAt` and `partnerHeld`). `requirePartner`
  returns `PartnerOk` (`sessionId`, `stepup`, `confirmedAt`) or `needs_passkey` with a `PartnerIdentity` (only
  `src/lib/db/partner-passkeys.ts` takes it). **Every workspace definer takes `(session, stepup)` and re-checks it**
  (`app_partner_need`): pass the `PartnerOk` as a `Caller` (`src/lib/db/partners.ts`), never a bare uid. Hand over,
  invite, store changes, approving and deleting need a check in the last 5 minutes (the browser retries through
  `freshly`). Cookie `__Host-frrata_partner`. A page keeps the Permissions-Policy it loaded with: passkeys are allowed on
  `/partner`, `/join` and `/auth/confirm` only, so a link from the console or `/login` into the workspace is a full page
  load (`<a>`, `window.location`), never a client navigation. Signed out on `/partner/*` or `/join`, the session
  middleware sends people to `/partner/sign-in` (with `next`, and `out=1` when a dead session cookie was there), the one
  partner page open without a session (`PARTNER_PUBLIC` in check:actions). `signOutAction` takes `to=partner` to land
  there. An owner who ever had a passkey waits 24 hours to recover one, even after Admin deleted them all.
- **One brand record** (one-address P1, drizzle/0155): a code-site store's logo files, colours, fonts, corners and
  spacing are written ONLY by `saveBrand` / `decideBrand` / `undoBrand` (`src/lib/content/save.ts`; check:actions pins
  that they call requireMember and asMember), the main logo too (`shop_settings.logo_url`). Who: `brandSaver`
  (`src/domains/brand/who.ts`); a partner's save on an open store waits in `brand_proposals` (`kind = 'brand'`) for the owner (one
  `brand` notice). Readers take the live record through `shopBrand` (60 s) or `apiBrand` (the API's hour), both on the
  `settings` tag, never `previous` or a proposal. An SVG logo is stored only as the cleaner writes it again
  (`src/domains/brand/svg.ts`) and shown only through `<img>`; paper and email read the PNG rendition
  (`renditionUrl`, derived from the main logo's URL, made by `ensureRendition`).
- **The checkout design** (one-address P2, drizzle/0161): a code-site store's header, back link, policy rows, trust
  blocks and two lines live in `checkout_design`, written ONLY by `saveCheckout` / `undoCheckout` and `decideBrand`
  (one door for both kinds of waiting change) in `src/lib/content/save.ts`; its rules are `src/domains/brand/checkout.ts`
  (save, preview and render run the same check; a part that fails a later rule renders as Frrata's default). A
  partner's change on an open store waits in `brand_proposals` with `kind = 'checkout'`: **one open change of each kind
  a store**, so every read and write of a proposal names its kind. A newer save is a new row (the older one
  `replaced`), and an answer names the row and kind it showed (`decideBrand({ id, decision, kind })`): an answer to an
  older row is refused in words ("Your partner sent a newer change."), never applied to the newer one. The store's pages read it with the record through
  `checkoutLook` (`settings` tag) and draw it with `BrandFrame` (`src/components/storefront/brand-frame.tsx`), whose
  rules travel inline (`brand-css.ts`): nothing a code-site page needs goes in the shop's shared sheet (15.9 kB).
  A Builder reads the live design's columns and the store's public delivery, returns and Pay on delivery facts.
- **A partner's own records** (P2 Clients, 2026-11-16; drizzle/0146–0147): a partner's bills to its clients are
  platform-scope tables that NO Frrata role reads (`frata_app`, `frata_admin`, `frata_builder`: no grant, RLS on, a
  restrictive `definer_only` policy; `check:tenant` fails any table grant). Definers take the partner from the caller's
  live owner membership (`app_pm_live`), re-check the step-up, and match a link or bill id on the caller's partner
  (`not_found` otherwise). Frrata Admin gets a count and a first-bill date (`admin_partner_bill_stats`), never a row.
  Writes are counted first in their own statement (`app_partner_bill_try`, its own table) so a refused write still
  counts. Anything `partnerClients()` returns runs on every console page a partner opens (the building banner): heavy
  reads go in a definer only `/partner` calls (`app_partner_client_shares`). Proof: `tenancy.sql` § 85.
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
- **Owner-only settings after handover** (partner publishing PP1, 2026-11-16; spec
  `docs/specs/2026-11-16-partner-publishing.md`, drizzle/0150, proof § 87): what only the owner or a Manager changes once
  a store has an owner is ONE pure list, `src/domains/settings/owner-only.ts` (`lockedFor(role, hasOwner, support)`):
  Policies and every policy page's text, Business and GST whole, Contact's grievance officer, the invoice signatory and
  series. A partner is locked only when `hasOwner && !holds(role, 'shop.manage')`; a support visit always; owners and
  Managers never. `editors` stay CAN_BUILD (the pages open); `saveSection` and `savePolicyText` are the lock (Postgres
  doesn't stop a missed writer: frata_app updates `shop_settings`), and they read it inside the `asMember` transaction
  through `hasOwnerHeldIn` (the store's row FOR SHARE first; accepting a handover holds it FOR UPDATE), refuse a whole page
  in words, DROP locked fields from what is written (an omitted key can't blank them) and refuse one sent changed
  (compared after the save's own normalisation). Ask the owner is `app_ask_owner(uid, page)` (a live partner of this
  store, a store with an owner, one line a page an India day under an advisory lock, worded on read from its fixed href);
  `ask_owner` notices, and a partner's waiting brand change (`brand`, one-address P1), reach owners and Managers only
  (`seesAsks` in `listNotices`/`unreadNotices`,
  `app_notice_members(notice)` for email). A new writer of these columns asks the same list.
- **Adding a role: read every caller of the tuple it joins** before it joins
  (2026-11-07). A settings section declares its own `editors`
  (`src/domains/settings/sections.ts`), read by its page, its save and the brand
  upload, so a new section decides who edits it on purpose.
- **Partners** (`docs/specs/2026-11-07-partner-foundations.md`): a partner is a
  member with role `partner`, never a cross-tenant role. Their workspace reads
  only Frata's own facts about their stores, through definer functions in
  `src/lib/db/partners.ts` that take the `PartnerOk` as a `Caller` (user, session, step-up; T1b). `requirePartner()` is the
  workspace's first line (`check:actions`). `partners` has no frata_app grant.
  The attribution is `partner_links.created_at`, written once; the share's
  window starts at `share_starts_at` (first opening, a trigger) and terms are
  snapshotted from `PARTNER_TERMS`. A handover invite is never claimed at
  sign-in: it waits for Accept (`app_accept_handover_v2`, 0066), which claims the
  new owner's verified email for the shop's trial or ends it (one trial per business). A partner shop's trial starts at
  creation and it cannot be published until it has an owner (trigger in 0066). A partner's cap counts its
  shops not yet handed over, and a shop with no owner is never billed (`app_shops_to_bill`).
- **Studio credits** (C1, 2026-11-22; plan `docs/plans/2026-11-22-c1-credits.md`, drizzle/0163–0165 and 0168–0169, proof
  § 89): eleven platform-scope tables (`partner_billing`, `partner_seats`, `partner_credit_purchases`, `partner_invoices`,
  `partner_credit_uses`, `partner_credit_entries`, `partner_client_budgets`, `partner_credit_notices`, `partner_credit_tries`,
  `fx_rates`, `partner_mandate_cancels`) that NO Frrata role reads (P2's pattern; `check:tenant` names them; the one carve-out is
  `admin_fx_rate_latest()`, a definer that gives `frata_admin` the latest rate row for Admin › Costs, drizzle/0172). The ledger is `partner_credit_entries`,
  append-only lots and draws; a balance is a sum, never stored. Rows that point at each other carry the partner in a
  composite foreign key on `(partner_id, id)` (`partner_links` and `partner_members` gained that key), and those keys are
  RESTRICT: a tenant or partner person with Studio uses can't be deleted until an erase flow decides what happens to them.
  Definers in four families: person `(session, stepup)` (the owner's writes; a Lead reads assigned budgets; a Builder only
  a client's used and budget in Studio's panel), system ids-only (`app_pc_*`, called only from `src/lib/db/partner-credits.ts`
  and `src/lib/studio/**`), turn- and site-keyed (V3a, V2a), and one Admin aggregate (`admin_partner_gst_rows`, unioned into
  the GST export). A payment is believed only from the server's fetch of OUR order or the stored, verified webhook
  (`app_pc_apply`, matched by order id, amount, INR and the server's test mode; refused money becomes `refund_due`). The
  free 20 are granted by a trigger on `partners` (approval is a plain update). The SQL restates the pure rules in
  `src/domains/studio/credits.ts`; `sql-drift.test.ts` pins the numbers. Their background work runs hourly in `/api/cron/credits`
  (`src/lib/studio/run.ts`): stragglers, seat renewals and their notices, renewal orders, refunds, mandate cancels and the
  partner's emails, never in the daily outbox job. A mandate no longer used goes on `partner_mandate_cancels` (a queue,
  never one overwritten slot) and the run cancels it with retries. Studio → Studio Plus starts at once (C1·B, 0169):
  a start buys only with a token, and never on a day the old seat's renewal is also taken (the claim waits for an open
  start; a start captured after a renewal was claimed is refunded). ONE billing inbox serves both families (drizzle/0165):
  `/api/webhooks/billing` and `app_apply_billing_event` route a partner's payment by OUR stored order id, a token event to
  both merchant and partner mandates, and a refund Frrata didn't make or a dispute to a clawback (what was spent becomes a
  debt, `app_pc_debt`, paid from bought credits). A change to the merchant billing webhook is a change to partner credits:
  run 62-billing and proof § 89 both.
- **Partner teams** (T1a, 2026-11-12; plan `docs/plans/2026-11-12-studio-build.md`, drizzle/0123–0124): a partner is a
  team in `partner_members` (owner | lead | builder, T1c; the owner moves Lead ↔ Builder with `app_partner_set_role`,
  fresh check) with `partner_assignments` (which stores a lead
  works on). Both tables are definers-only for `frata_app` (check:tenant fails any grant but Admin's select). A partner
  person's shop access is still a `members` row with role `partner`, now pointing at its person
  (`members.partner_member_id`, CHECK `(role = 'partner') = (partner_member_id is not null)`); only definers write those rows
  (`app_partner_*`, `app_remove_partner`, the handover ones, `admin_end_partner` / `admin_reinstate_partner`), and `app_access_for` counts one only while the member, the partner (approved, not
  suspended) and the link are live (`app_pm_live`). Who may do what: `PARTNER_CAN` in `src/domains/partners/team.ts` decides what
  a page offers (Team, Your details, Hand over in Clients: owner only), the definers are the lock (owner-only team and handover, with a passkey check in the last 5 minutes; a colleague never accepts a
  handover). Invites are claimed by the invited, confirmed email on `/join` (no token); 7 days; ≤ 50 people;
  20 invites an hour. Admin suspends with `admin_end_partner` (deletes every partner person's shop rows, audits, tells
  each shop) and reinstates from assignments (tells each shop again). While paused, `app_shop_people` lists the partner
  from its link (`partner_paused`) so the brand can still remove it. `app_partner_my_invites` lists only invites the
  person could accept (sign-in sends anyone with one to `/join`). A lead or a Builder never gets the owner's contact details, the plan or the partner's terms (`app_partner_clients`, T1c). A fixture that makes someone a partner on a shop uses e2e `partnerOn`.
- **Capabilities and Builders** (T1c, ADR-0015; plan `docs/plans/2026-11-15-t1c-builders.md`, drizzle/0130–0131, proof
  § 82): who may do what in a shop is ONE table, `CAPABILITIES` in `src/domains/tenancy/roles.ts`; the tuples
  (`ANY_MEMBER` …) are views of it, pinned by `capabilities.test.ts` (a change to who holds a capability reaching orders,
  shoppers or costs carries the owner's name and date). A partner's **Builder** (`members.role = 'builder'`, from
  `partner_members.role` by trigger; frata_app holds no UPDATE on `members`) is a SHOP role but never a `MemberRole`:
  `accessFor` puts its stores in `builds`, so `requireMember`/`asMember` can never carry one and every tuple refuses it
  in words (`BUILDER_REFUSED`, drawn once by `Panel`). A Builder enters only through `requireCapability(cap)` in the
  files of `scripts/builder-doors.json`, which gives an **Actor** (`src/lib/db/actor.ts`) whose shop id no page can
  read (Studio's `asTurn` is the one other maker: a partner person's tool reads as frata_builder, § Studio's agent); `withActor` runs read-only as **frata_builder**, its own LOGIN (`DATABASE_URL_BUILDER`; missing → refused),
  column grants on eight catalogue tables and, for Console › Brand's preview (one-address P1·2, drizzle/0155), the live
  `brand_tokens` columns and `shop_settings.logo_url`, and, for Brand › Checkout's preview (one-address P2, drizzle/0161), the live
  `checkout_design` columns and `shop_settings`' seven public delivery, returns and Pay on delivery facts, and nothing else, with
  `builder_rows` + restrictive `builder_only` policies.
  Builder reads live in `src/lib/queries/builder.ts` and call the owner list's own SQL (`listProductsWith`,
  `listCollectionsWith`): a column added there needs its grant in a migration, or the Builder's list fails closed. The
  store preview is the one exception (owner 2026-11-15): it runs the shopper read path as frata_app through
  `previewTenantOf`. `check:capabilities` and `check:tenant` § 7b hold all of it. Notices reach members through
  allow-lists (`app_notice_members(notice)`, `app_member_email`), never a Builder; a partner's ask (`ask_owner`, PP1) and a
  partner's waiting brand change (`brand`, one-address P1, 0155) only owners and Managers.
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
  header of the same name, so it carries the whole policy and X-Frame-Options; e2e 12-security). Framed only by the
  console itself (SAMEORIGIN, `frame-ancestors 'self'`, on the console host; DENY elsewhere): `/console/theme-preview/*`
  and, for Studio's preview pane, `/console/studio-preview[/*]`: the store alone, `requireStudio`'s store only, in an iframe sandboxed to `allow-same-origin` (owner 2026-11-23; `/console/preview` is DENY like every console page; `src/lib/__tests__/framing.test.ts`).
- **Route handlers are not server actions:** Next checks Origin for actions
  only. A cookie-authenticated POST route checks `Origin` itself, as
  `requireShop` does; `requireShop` also weighs `Sec-Fetch-Site` (`src/lib/auth/fetch-site.ts`: sibling stores
  are same-site until the PSL lists frrata.shop; logged, then refused). Console and shops stay on different registrable domains.
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

- **A popup that saves part of a settings section** (O2a, 2026-11-23) goes through `parseFields` and `SETUP_FIELDS`
  (`src/domains/settings/fields.ts`): the subsets are named on the server, only the keys sent are written
  (`Object.hasOwn`), the whole section is checked against the stored values, and the save keeps every page lock
  (`columnsIn` in `console/settings/save-locks.ts`: PP1, an open store's grievance officer, Delivery Zones' fields)
  and the version. Never a whole-section parse of a partial form: a field the popup leaves out would be blanked.

**An anonymous action that reads the database** (O1·7, `src/app/start/check-address-open.ts`) is its own `'use server'`
file in `check:actions`' ENTRY_POINTS with exactly its named exports (EXACT_EXPORTS: a second export fails the gate),
limited per network (IPv6 /64), per site (IPv6 /48, `netBucket`) and by one global bucket, all failing closed, and
answers a silent `limited` rather than a false answer; whatever it guards is checked again where it is written.

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

## Config

Server secrets in `src/lib/env.ts`, public values in `src/lib/public-env.ts`,
`CRON_SECRET` in `src/lib/auth/cron.ts` — one reader each, every name in
`.env.example` (`check:config`). The db connection is lazy: a build with no
`DATABASE_URL` still compiles.

## Hosting (ADR-0005)

Vercel `bom1` + Supabase ap-south-1. Storefront routes set `revalidate`;
console routes are dynamic. Cron schedules in `vercel.json`: legacy `crons` are daily on Hobby,
per minute on Pro; Vercel Schedules (public beta 2026-11-05) allow every 15 min on Hobby within 5,000 runs a billing
period (frata-integrations § Domains). Build for daily; a beta schedule is an option, not a dependency. Migrations: see CLAUDE.md § Deploying.

## Studio's agent (ADR-0020; spec docs/specs/2026-11-16-studio-agent.md; built from V3a, docs/plans/2026-11-22-v3a-runtime.md)

- **The loop runs outside the sandbox, code inside it, anything that touches Frrata on Frrata's server.** The runtime is
  Managed Agents behind one adapter (`src/lib/studio/runtime.ts`, `runtime-managed.ts`; the client only in `client.ts`,
  `check:config`): vaults, files, start (always with a budget), budget, send, answer, interrupt, events, usage, archive,
  remove. Nothing else calls Anthropic for a session. Tests use `e2e/fakes/anthropic.mjs`, never the live API.
- **A person enters through `requireStudio()`** (`with-studio.ts`): `STUDIO_OPEN=staff`, Frrata staff with a live staff
  check who is also a live partner person with their check, both on one browser session, on the switcher's store where
  they are the partner (never a support visit). `withStudio` then asks the database to bind them.
- **The partner is a database-held bind, never a setting:** `app_current_partner()` answers only for a `studio_binds` row
  of THIS transaction whose token is in `app.studio_bind`, written only by `app_studio_partner` (withStudio) or
  `app_studio_bind_turn` (asTurn, the advance). The bind proves a person (user, membership, the two step-up rows).
  Every `studio_*` shop table has a restrictive `partner_only` policy on tenant and bound partner and composite foreign
  keys to its session; spend, turn keys and binds are platform-scope, definer-only tables (drizzle/0167, proof § 91).
- **Every custom tool runs through `asTurn(turn, work)`** (`as-turn.ts`), the second Actor maker beside
  `require-capability.ts` (`check:capabilities`). The turn is Frrata's own open-turn row, from the cron's ids-only work
  list or the person's own session, never an id from a request, an event or a tool's input (`check:studio` pins who
  imports the advance and asTurn). The person is re-checked by `app_turn_actor` in its own short transaction, which
  closes; reads then run outside any transaction as `frata_builder` through `ctx.reads` (`src/lib/queries/builder.ts`,
  one connection per advance: `withBuilderScope`); a write is `ctx.write((tx, partnerId) => …)`, a store transaction the
  database bound again. The person gone at either point answers `actor`.
- **The store's key never reaches the model or the sandbox:** a build key in the session's vault, a header credential for
  `api.frrata.shop` only (ADR-0018's build-key amendment), looked up uncached; never reflected in an answer.
- **`check:studio`** holds the shape: the agent file against the policy, the definers' callers, tool imports, the doors
  (who may import the advance, asTurn, sessions.ts and cron.ts), no runtime call or cached loader inside a transaction,
  no id-shaped tool input.

## Reference files — open the one for the work in hand

The sections above bind every change. The rest are in one file each below, moved there unchanged (practices plan
G4, 2026-11-16); a "§ <name>" named elsewhere is in SKILL.md or in the file listed here.

| Open | When | Sections |
|---|---|---|
| [reference/money-and-gst.md](reference/money-and-gst.md) | anything that stores, computes or moves money (paise, profit, fees, refunds), GST, Razorpay keys, trials | Money, GST, Razorpay keys that stop working, Trials, Admin › Costs |
| [reference/catalogue-and-content.md](reference/catalogue-and-content.md) | products (writing, importing, links), what a store sells (category packs), a store's content, search and sharing, photos, delivery zones, attribution, EkCode | A store's content, Category packs, Writing products, Importing products, Catalogue links, Search and sharing, Photos, Delivery, Attribution, EkCode |
| [reference/modules-themes-sites.md](reference/modules-themes-sites.md) | a module (apps), a theme (retiring, ADR-0014), or the kit and fleet rules for shop websites as code | Modules, Themes, Shop websites as code |
| [reference/speed.md](reference/speed.md) | a page, query, cache or background job: the budgets, what holds each, and the findings P1–P15 | Speed |
| [reference/studio.md](reference/studio.md) | Studio's agent: tools and Apply, the advance, the screen, Send, Stop and the cron as built (V3a) | Tools and Apply, The advance, The screen, Send and the cron |
| [reference/analytics-database.md](reference/analytics-database.md) | visits, the analytics database, its migrations or the visit beacon | The analytics database |
