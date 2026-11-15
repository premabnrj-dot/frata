# T1c · Builders: capabilities, and a Builder who never sees orders, shoppers or costs
Status: draft (plan; architecture, tenancy, security and words reviews folded in 2026-11-15; final mockup awaiting the owner) · Date: 2026-11-15 · Lane C
(`claude/lane-c-builders`, `docs/plans/2026-11-15-parallel-lanes.md`) · Decision: ADR-0015 accepted (owner 2026-11-15:
"builders approved") · Spec: `docs/specs/2026-11-12-studio-intake-and-team.md` § Partner teams · Row: T1c in
`docs/plans/2026-11-12-studio-build.md` · Builds on T1a (teams, 0123–0124) and T1b (partner passkeys, 0128–0129) ·
Approved source mockup: Studio v2.4 Team (https://claude.ai/artifact/KiqKqrFCx4enB8KUrnh5Du) · **Final mockup of this
phase:** https://claude.ai/artifact/LnwWWrV37oQgbnfmc5bvFP (`docs/mockups/2026-11-15-t1c-builders.html`)

## Goal
Ranked problem 5 (a premium storefront, built as code by partners; partners get the builder first). An agency puts its
designers and developers on a brand's store without handing them the brand's orders, shoppers' names, phones and
addresses, or its costs. Measure: a partner owner can invite a Builder, assign stores and change Lead ↔ Builder; the
Builder opens only Products, Collections and Preview store; `verify:tenancy` § 80 proves `frata_builder` reads nothing
else; e2e `86-builders` sweeps every console route and finds no refusal missing.

## Regression net (before the first line of code)
Run on the branch head and kept green after every task:
- **The partner flows:** e2e `40-partners` (apply, build, hand over, remove), `80-partner-team` (invite a Lead, passkey
  approval, assign, remove, suspend, reinstate), `75-staff-passkeys` (support visits and `app_access_for`, which this
  phase changes again).
- **The console flows a Builder must be refused from** (they hold the owner and staff paths that must not move): `40-queue`
  (orders), `79-products-list` (the list a Builder sees read-only must stay the same for owners), `47-look`, `51-analytics`,
  `64-seo` (collections), `12-security` (headers, nonce, frame rules), `82-neel-shell` (the nav), `90-ux` (targets).
- **Proofs:** `npm run verify:tenancy` § 77 (teams) and § 79 (partner passkeys) green before; § 80 added in task 2.
- **Unit:** `src/domains/tenancy/__tests__/capabilities.test.ts` lands FIRST in task 1, as a snapshot of today's tuples,
  so the move to capabilities is proven to change no one's access; `src/domains/partners` tests; `check:tenant`.

## Every caller of the role tuples (frata-architecture § Auth: "Adding a role: read every caller of the tuple it joins")
A Builder joins **no tuple** (ADR-0015 § 1). Read on 2026-11-15 (`grep -rlw`), files outside `roles.ts`:

| Tuple / rule | Callers | Builder | What changes |
|---|---|---|---|
| `ANY_MEMBER` | 55 (orders, products, collections, customers, inbox, preview, Home, search, apps…) | refused | nothing: `requireMember` never returns a Builder's membership (§ Auth below). Products, collections and preview move to `requireCapability` (task 4) |
| `CAN_BUILD` | 21 (look, offers, settings, search and sharing, delivery zones, upload) | refused | nothing |
| `CAN_MANAGE` | 31 (people, payments, address, open, billing, publish) | refused | nothing |
| `CONSOLE_ROLES` | 11 (the console layout, notices page and action, settings › emails and notifications, apps gst / true_profit / delivery_zones, `api/console/tenant`, a test) | refused | the layout and `api/console/tenant` (switching store) ask `console.open` instead; the rest keep the tuple, which stays without `builder` |
| `SHIPPERS`, `CAN_SEE_GST`, `CAN_INVITE_ACCOUNTANT`, `CAN_SET_COSTS` | 1, 4, 2, 4 | refused | nothing |
| `seesCosts(role, hasOwner)` | 18 | false | `builder` answers false by its own line (as `accountant` does); `costsVisibleIn` fails closed already |
| `managesInPerson` | 4 | false | nothing (CAN_MANAGE) |
| `ROLE_LABEL`, `MEMBER_ROLES` | 4, 3 | — | `Builder` label; `MEMBER_ROLES` gains `builder` → the `members_role` CHECK is regenerated |
| Member-role `===` in code | layout L97 (partner banner), L134 (accountant), L147/149 (owner/admin banners), `true_profit/page.tsx:61`, `domains/communication/roles.ts:4`, `email/notice-sender.ts:60`, `queries/settings.ts:83`, `start/page.tsx:25`, `components/passkeys/partner-gate.tsx:59` (partner role) | none reaches a Builder | each read: none grants a Builder anything; the gate freezes this list (ratchet) |

**SQL that reads `members.role` or `partner_members.role`** (the latest definition of each, 0124 and 0129):

| Definer | Today | T1c |
|---|---|---|
| `app_access_for` | counts a `members` row with `partner_member_id` only with a live partner step-up | unchanged rule; the row's role (`partner` or `builder`) is returned as stored |
| `app_pm_live` | owner, lead | returns `builder` too (it reports the role; each caller filters) |
| `app_partner_invite` | owner only; role lead | role `lead` or `builder` |
| `app_partner_accept` | `bad_role` unless lead | lead → `members.role partner`; builder → `members.role builder` |
| `app_partner_assign` | lead only | lead or builder; the `members` row takes the person's role |
| **new** `app_partner_set_role` | — | owner only, fresh passkey (5 minutes): Lead ↔ Builder; the person's every `members` row changes role in the same transaction; audit row per shop |
| `app_partner_remove_member`, `app_remove_partner`, `admin_end_partner` | delete by `partner_member_id` | unchanged (role-blind, correct) |
| `admin_reinstate_partner` | rebuilds `members` rows as `partner` | rebuilds each with the person's role |
| `app_partner_clients` | owner all; lead assigned, **with the owner's email, the open invite and the plan** | builder: assigned only, those three `null` (a Builder never sees the brand's people or plan) |
| `app_partner_create_shop` | owner or lead | unchanged: a Builder is refused |
| `app_handover_invite` | owner only (0129) | unchanged |
| `app_my_partner` | owner, lead | returns `builder`; `partners.ts` maps each role by name, an unknown role refuses (review H2) |
| `app_my_handovers`, `app_accept_handover_v2` | refuse any active member of the linked partner | unchanged (role-blind) |
| `app_partner_pk_approve` / `_decline` / `_remove_all` | `pm.role = 'lead'` | `pm.role in ('lead', 'builder')` |
| `app_partner_team` | lists owner, lead, builder | unchanged |
| `app_shop_people` | labels partner people | `Partner · Builder` beside `Partner · Lead` (People page) |
| `app_notice_members` (0096) | every member | **excludes `builder`** (ADR-0015: `new_order` and `needs_you` never reach a Builder; no notice does in T1c) |
| `app_member_email` | any member | refuses a `builder` (no notice is ever addressed to one) |
| `members` CHECK | `(role = 'partner') = (partner_member_id is not null)` | `(role in ('partner', 'builder')) = (partner_member_id is not null)` |
| `invites_role` CHECK | owner, admin, staff (never partner) | unchanged: a shop never invites a Builder; only a partner owner does |

## Design

### Capabilities (`src/domains/tenancy/roles.ts`, the one file; pure)
- `CAPABILITIES: Record<Capability, readonly MemberRole[]>`. T1c's set, each line a comment with what it opens:
  `console.open` (everyone in `CONSOLE_ROLES` + `builder`), `catalogue.read` (`ANY_MEMBER` + `builder`),
  `preview.read` (`ANY_MEMBER` + `builder`), and one capability per tuple, holding exactly its roles today:
  `orders.work` = ANY_MEMBER, `shop.build` = CAN_BUILD, `shop.manage` = CAN_MANAGE, `parcels.send` = SHIPPERS,
  `gst.read` = CAN_SEE_GST, `accountant.invite` = CAN_INVITE_ACCOUNTANT, `costs.set` = CAN_SET_COSTS,
  `console.full` = CONSOLE_ROLES. **The tuples become views** (`export const ANY_MEMBER = CAPABILITIES['orders.work']`),
  so no caller changes meaning on the day it lands; the snapshot test proves it.
- `costs.read` stays the predicate `seesCosts` (ADR-0015 § 3), now with `builder → false`.
- `studio.build`, `studio.publish`, `exports`, `documents`, `shoppers.read`: not declared until a page needs them (V3,
  and the file-by-file move): default deny means nothing waits on them (YAGNI; the ADR names them as examples).
- Change control: `capabilities.test.ts` snapshots the table; a line that adds a role to `orders.work`, `console.full`
  or any capability `builder` lacks carries `// owner <name>, <date>` and needs the tenancy-auditor on its diff
  (ADR-0015 § 6). `PARTNER_ROLES` already holds `builder`; `PARTNER_CAN` stays (manageTeam, seeDetails, handOver: owner).

### Who the person is, and the Builder's door (`src/lib/auth/`, `src/lib/db/actor.ts`)
- `accessOf` returns Builder memberships as `app_access_for` gives them. **`requireMember(tuple)` never returns one**:
  it picks the store exactly as today (the `frata_tenant` cookie, else the first); when that store's membership is a
  Builder's it answers `{ ok: false, reason: 'builder', message: 'Builders can’t see this page.' }` and never falls
  through to another store. So every one of the 55 + 31 + 21 … callers above refuses a Builder with no edit, and every
  action through `asMember` too (it calls `requireMember`).
- **`requireCapability(cap)`** (new, `require-capability.ts`, cached per request like `requireMember`): the same store
  choice; ok when the membership's role holds `cap`. It returns `{ ok: true, kind: 'member', auth, actor }` (a
  non-Builder, with today's `MemberResult` beside the actor, so a page can keep its old reads) or
  `{ ok: true, kind: 'builder', actor, places }`.
- **`Actor`** (`src/lib/db/actor.ts`): an object whose tenant id is held in a module-private `WeakMap`, so no page can
  read it and hand it to a `(tenantId: string)` query: a Builder's request **cannot** reach a legacy reader by typing
  `.tenantId`; the compiler refuses. `withActor(actor, work)` opens the tenant transaction: for a member actor it is
  `withTenant` unchanged; for a Builder ONE statement `select set_config('app.tenant_id', $1, true),
  set_config('app.member_role', 'builder', true), set_config('role', 'frata_builder', true)` (SET LOCAL ROLE, for this
  transaction only), then the work. Only `actor.ts` sets or resets `role` (gate).
- **`assertCan(actor, cap)`**: every function that takes an `Actor` calls it first (gate), and throws on a role that
  lacks the capability (a bug, never a user path).
- **The preview** is the store as shoppers see it: `previewCatalogue`, `previewShop`, `previewProduct`, `previewLook`
  build shopper-shaped data whose cost-free shape ADR-0003 and `check:client-bundle` already hold. A Builder's preview
  reaches them through `previewTenantOf(actor)` (`assertCan(actor, 'preview.read')`), the ONE sanctioned unwrap,
  named in `check:capabilities`. It runs as `frata_app` because its loaders read aggregates over orders (held pieces,
  best sellers by delivered units) and return ids and counts only. Reviewers: see the tenancy and security notes below.

### The database (two migrations: one generated, one `--custom`; numbers renumbered at merge)
1. **Generated:** `members_role` CHECK from `MEMBER_ROLES` (adds `builder`); the partner CHECK becomes
   `(role in ('partner','builder')) = (partner_member_id is not null)`.
2. **Custom (`*_builders_access.sql`):**
   - `create role frata_builder nologin noinherit nobypassrls` (guarded `if not exists`, as 0001); `grant frata_builder
     to frata_app` (so `frata_app` may SET ROLE to it; `noinherit` on `frata_app` means it never gains its grants, and
     `frata_builder` is a member of nothing, so it never gains `frata_app`'s).
   - `app_member_role()` = `nullif(current_setting('app.member_role', true), '')`, `stable`, invoker.
   - **Grants, an allow-list by column** (default deny: a new table or column is invisible until a migration names it):
     `usage on schema public`; `select (id, tenant_id, title, handle, status, description, tags, category, created_at,
     updated_at, archived_at, published_at)` on `products` — the exact list is the one the Builder list reads, checked
     against `schema.ts` in task 2; `select (id, tenant_id, product_id, size, colour, price, compare_at, stock,
     when_out, ships_by, archived_at, position)` on `variants` (never `unit_cost`); `select` on `product_images`
     (`tenant_id, product_id, base, position, colour, alt`); `select (id, tenant_id, title, handle, kind, rules,
     updated_at)` on `collections`; `select` on `collection_products`. `execute` on `app_current_tenant()` and
     `app_member_role()` only. No insert, update or delete anywhere; no sequence; no definer.
   - **Policies** on each of those five tables: a permissive `builder_rows` (`to frata_builder using (tenant_id =
     app_current_tenant())`) and a restrictive `builder_only` (`as restrictive to frata_builder using ((select
     app_member_role()) = 'builder')`): a role set without its setting reads nothing (ADR-0015 § 3, "an unset role
     refuses").
   - `revoke execute on all functions in schema public from frata_builder` (functions keep PUBLIC execute by default;
     every definer already revokes PUBLIC, the gate and § 80 hold it for new ones), then the two `execute` grants.
   - The definers in the table above (`create or replace`, grants re-run: frata-architecture § Definers).
3. **`scripts/verify/tenancy.sql` § 80** (next free block; renumbered at merge if a lane takes 80): two shops, a partner
   with an owner, a lead and a builder on shop A only. As `frata_builder` with A's tenant and the setting:
   products/variants/images/collections of A read; of B nothing; `variants.unit_cost`, `orders`, `order_lines`,
   `customers`, `conversations`, `messages`, `discounts`, `shop_settings`, `payment_keys`, `audit_events`,
   `notices`, `outbox` each raise permission denied; every insert/update/delete raises; `has_function_privilege` is
   false for every `prosecdef` function in `public`; without `app.member_role` the allowed tables read nothing;
   `reset role` inside the definer-free path is impossible from SQL the app sends (asserted by the gate, not SQL). Then
   the definers: a lead can't be made Builder by a lead; the owner can, and the person's rows change role in A; the
   builder's `app_partner_clients` has no owner email, invite or plan; `app_notice_members` omits the builder;
   `app_member_email(builder)` is null; `app_partner_create_shop` and `app_handover_invite` refuse the builder;
   cross-partner set-role refused; removed person: no `app_access_for` row; reinstate rebuilds a builder as `builder`.

### Screens (one final mockup, desktop and phone; Rule 0)
1. **Partner workspace › Team** (owner): the invite dialog gains **Role**, a `Segmented` (Lead · Builder, Lead first and
   chosen), with two lines under it: what the role reaches, and what it doesn't (approved Studio mockup's
   "can-list"); each row shows its role in words ("Builder · 1 passkey") and a **Role** select for Leads and Builders
   (owner's row has none); changing it asks a fresh passkey through T1b's check dialog as built (`freshly`, no new words) and toasts
   "meera@pixelthread.in is now a Builder." A
   **Roles** card beside the list (approved Studio mockup: the matrix) with T1c's columns: Owner · Lead · Builder ×
   Orders and shoppers · Costs and profit · Products (Edit / View) · Look and settings · Hand over · Team; the first
   column is "Partner owner".
2. **A Builder's workspace:** Clients lists the assigned stores (name, stage, Open store); no "New client store", no
   Hand over, no owner email or plan. Nav: Clients, Passkeys.
3. **A Builder's console** (the same `AppShell`; nav: Catalogue › Products, Collections; foot: Preview store; the store
   switcher; on a phone the bottom bar is Products · Collections · Preview): **Products**, the list as owners see it
   (view tabs with counts, search, sort) minus what writes or counts money: no checkboxes or bulk bar, no "Add
   product", no More (import, photos); a row opens that product in Preview store. **Collections** likewise; a row
   opens the collection in Preview store. `/console` sends a Builder to Products.
4. **Refusal:** any other console address shows the Builder's shell with one `Panel` "Builders can’t see this page" and
   the action "Open products". No number, name or count from that page is computed.
5. **The brand's side:** Settings › People lists the Builder as "Partner · Builder" with an (i) ("Sees products and the store preview. No orders,
   shoppers or costs."); a partner person's bold line is the partner's name, the email once under it (fixes today's
   double email); the partner's button reads "Remove partner"; Remove the
   partner removes every partner person (today's action).
6. **/join:** "Join Pixel & Thread as a Builder" (the invite's role in its words).

### Deviations from ADR-0015's text (shown to the owner with the mockup)
| ADR line | This plan | Why |
|---|---|---|
| "`withTenant` takes an actor" | `withActor(actor)` is the Builder's (and new code's) door; the 176 `withTenant(tenantId)` calls in 63 files stay for owner, admin, staff, partner, accountant, shop and system, and move file by file (gate ratchet) | the Builder can never hold a tenant string, so no legacy call can run for one; a 63-file change now would collide with lanes A and B for no added lock |
| "role policies on sensitive tables" | `frata_builder` holds no grant on them at all, and its five tables carry a restrictive role policy | a grant refuses before any policy; a restrictive policy on every frata_app table would also refuse today's raw platform paths |
| "every sensitive definer checks `app_member_role()`" | `frata_builder` may execute no definer (§ 80 asserts it); the definers reachable through a partner's uid (`app_partner_*`) check the person's role themselves | every one of the ~194 definers already revokes PUBLIC, and `frata_builder` holds no direct grant; § 80 checks every schema |
| "For a Builder it runs `set local role frata_builder`" (§ 3, § 5) | the store preview runs as `frata_app`, reached only through `previewTenantOf` | its loaders read orders for held pieces and best sellers and return only what shoppers see; owner question 5 |
| e2e: "every route answers 404" | the page's own refusal `Panel` (HTTP 200) inside the Builder's shell | every page already refuses through `requireMember`; a 404 needs each of 55 pages edited |
| "Audit: each refusal logged … repeated refusals alert" | logged (`[builder refused]` with capability, route and member id, never an email); the alert waits (owner question 2) | no alert channel to a partner owner exists before C1 |

## Tasks (each ends with its verify command and `impact-reviewer` on its diff)
1. **Capabilities, no one's access moves.** `capabilities.test.ts` (snapshot of today's tuples) first; then
   `CAPABILITIES`, the tuples as views, `builder` in `MEMBER_ROLES`, `ROLE_LABEL`, `seesCosts`. Typecheck finds every
   `Record<MemberRole, …>`. Verify: `npm test && npm run typecheck`.
2. **The database.** The two migrations, § 80, the definers. Verify: `npm run verify:tenancy`, then e2e `partners,
   partner-team, staff-passkeys`.
3. **The door.** `requireMember`'s Builder refusal, `requireCapability`, `Actor`/`withActor`/`assertCan`,
   `previewTenantOf`; `src/lib/queries/builder.ts` (`builderProducts(actor, query)`, `builderCollections(actor)`:
   named columns only, the list's own row shape; one `withActor` each); refusal logging. Unit tests: a Builder through
   `asMember` refused; `withActor` sets the three settings (int test on real Postgres: `current_user` is
   `frata_builder`); `assertCan` throws. Verify: `npm test`, `npm run typecheck`, the int tests.
4. **The screens.** Console layout on `console.open` (the Builder's nav; no counts, apps, banners or bell read for a
   Builder); Products, Collections, Preview store pages on their capabilities (read-only rows for a Builder);
   `/console` redirect; `api/console/tenant` on `console.open`; Team (Role in invite, Role select, Roles card), the
   team actions (`invite` takes the role; `setTeamRoleAction` through `freshly`), the workspace for a Builder
   (Clients, Passkeys), `/join`'s words, People's label. Verify: `npm test`, typecheck, e2e `partner-team,
   products-list, neel-shell`.
5. **The gates.** `scripts/check-capabilities.mjs` (in `npm test`): a role list naming `builder` outside `roles.ts`;
   `requireCapability` for a Builder-held capability outside `BUILDER_DOORS` (the layout, Products, Collections, Preview,
   `api/console/tenant`, the Home redirect: the e2e sweep reads the same list); an `Actor`-taking export without
   `assertCan` first; a new member-role `===` outside the frozen list; `set_config('role'`/`set role`/`reset role`
   outside `actor.ts`; `previewTenantOf` outside the preview page. `check:tenant`: any `frata_builder` grant outside
   the allow-list; a `frata_builder` policy that is not `builder_rows`/`builder_only`. Each gate run against the file
   that documents it.
6. **e2e `86-builders`** (phone and desktop): the owner invites a Builder to Amber (Role: Builder); the Builder joins,
   the owner approves their passkey; the Builder's nav shows Products, Collections, Preview store only; Products has no
   checkbox and its row opens the preview; **the sweep**: every console page folder under `src/app/(console)` (and
   `(lookeditor)`) not in `BUILDER_DOORS`, with fixture params, shows the refusal panel and its HTML holds no order
   number, phone, shopper name or ₹ from the seed; `GET` routes under `api/console` answer 401/403; a sensitive server
   action posted with the Builder's cookies answers its refusal; the brand's People shows "Partner · Builder"; owner
   sets Builder → Lead (nav grows) and back; owner removes the Builder → `/console` refuses. Verify: `npm run e2e --
   --only builders`, then `npm run release:check`.
7. **Document.** `frata-architecture` § Auth (Builders, capabilities, the actor, `frata_builder`), § Partners (role
   change); `frata-design-language` (the Builder's console, the Roles card) with version bumps; ADR-0015 "as built";
   `CLAUDE.md` one line (a Builder's door is `requireCapability`; `withActor` for new code); studio-build T1c row;
   `mockup-parity-reviewer` before closing.

## Design review
- **UI/UX:** the jobs: the partner owner puts a designer on a store without exposing the brand (one primary action,
  Invite); the Builder finds the catalogue and the preview fast. States: no Builders (Team's empty state as built),
  invited, active, waiting for passkey approval, role changed, removed; a Builder with one store (no switcher) or many;
  a store with no products (the list's empty state, minus "Add product": "No products yet"); refusal; phone. Norman:
  the Roles card is the signifier for what each role reaches; constraints over refusals (the Builder's nav holds only
  what opens); feedback after Role change (toast); recognition (role in words on every row).
- **Tenancy:** no new tenant table. The tenant id still comes only from `app_access_for` (through `requireMember` or
  `requireCapability`); a Builder's never leaves its `Actor`. `frata_builder` default-deny by grant, a restrictive
  policy, no definer. `tenancy-auditor` on this plan and on task 2's and 3's diffs.
- **Modularity:** capabilities pure in `roles.ts`; the door in `src/lib/auth/` + `src/lib/db/actor.ts`; Builder reads in
  `src/lib/queries/builder.ts`; pages compose. Core still imports no module.
- **SSOT / DRY:** who may do what is `CAPABILITIES` (tuples derived from it); a person's role is `partner_members.role`,
  copied into `members.role` only by definers in the same transaction (the CHECK binds them); the product list's row
  shape is one type used by both readers.
- **YAGNI:** no Studio capabilities, no credit caps (C1), no custom roles, no refusal alerts (question 2), no migration of
  the 176 legacy `withTenant` calls in this phase.
- **KISS:** one new DB role, five tables granted by column, one statement per Builder transaction; the preview reuses
  the shopper read path rather than a second copy of it.
- **Scalability / performance:** a Builder's transaction is one statement longer than nobody's: the three settings are one
  `select`. Builder reads are the products list's own queries with named columns (the existing indexes; 50 a page).
  Non-Builder paths run exactly as today (no extra statement). `app_access_for` unchanged in shape.
- **Reliability:** no outbound call. The invite email is the existing sign-in link.
- **Security:** each action: `inviteTeamAction` (owner, `PARTNER_CAN.manageTeam`, re-checked in the definer; Zod role ∈
  lead|builder), `setTeamRoleAction` (owner, fresh passkey through `freshly`, `app_partner_need(..., true)` in the
  definer; never the owner's own row; rate limit `partnerInvite`'s bucket), `assignTeamAction` (unchanged). A Builder
  holds no write in the console. Preview: shopper-shaped output only (ADR-0003). Logs: capability, route, member id,
  never an email. `security-reviewer` on this plan.
- **Motion and visuals:** `Segmented`'s slide (§ Neel primitives) and the toast (§ Feedback); no new motion. The Roles
  card uses ticks and dashes from `icon.tsx` with words for screen readers.
- **Unit economics:** none (no money moves; a Builder costs nothing until credits).
- **Blast radius:** `requireMember` (every console page and action: a Builder refusal branch, tested), the console layout,
  the products list page, the partner definers (`app_access_for` untouched), `MEMBER_ROLES` (every `Record<MemberRole>`),
  `scripts/check-tenant.mjs` and a new gate. Shared files (lanes rule 4): `src/domains/tenancy/roles.ts`, the console
  layout, `require-member.ts`, `src/lib/db/` (new `actor.ts`), `scripts/check-tenant.mjs`, `scripts/check-capabilities.mjs`
  (new), `package.json` (the gate in `npm test`), `CLAUDE.md`, `frata-architecture`, `frata-design-language`,
  `scripts/verify/tenancy.sql` (§ 80), `e2e/lib.mjs` (a `builder` user). Footguns written down: `set_config('role')`
  is undone by `reset role` (gate); a policy `to frata_app` never applies to `frata_builder` (so its tables need their
  own); dropping and recreating a definer resets its grants.

## Out of scope (and the signal that brings each back)
Studio and its capabilities (V3); Builder credit caps (C1); alerts on repeated refusals (owner question 2); moving the
legacy `withTenant` calls to actors (each file as it is next touched; the gate's ratchet shows the count); a Builder in
the Look (themes are retiring, ADR-0014).

## Owner questions
1. **A Builder's console holds Products, Collections and Preview store, read-only.** Recommended. (The alternative,
   Look too, gives them theme work that is retiring.)
2. **Refusals: logged now, an alert to the partner owner later** (when C1 brings partner notices). Recommended.
3. **A refused page answers with the page's own panel, not a 404** (Deviations). Recommended.
4. **Changing Lead ↔ Builder keeps the person's stores** (they move with the role). Recommended.
5. **A Builder's store preview runs on the shopper read path** (as `frata_app`): it shows drafts, availability after held
   pieces and the best-seller order, exactly as the live store would. Recommended (the alternative is a second copy of
   every storefront loader on `frata_builder`).
6. **Today a Lead receives the brand owner's email in Clients**, against the rule "a lead never gets the owner's contact
   details". Fix it in T1c (one line in the same definer), or leave it to its own change? Recommended: fix here.
7. **Builders connect to the database with their own login** (`frata_builder`, its own secret and a 2-connection pool),
   as Frrata Admin does. Recommended: no Builder query can ever run with the app's rights. You add one secret in Vercel.
8. **A Builder sees each product's stock count** (the list's stock column), not only "In stock" or "Sold out".
   Recommended: yes, it is catalogue work, not orders.

## Reviews on this plan (2026-11-15)
These override the text above where they differ.

**architecture-reviewer (CHANGES NEEDED):**
- **Blocker → the grant list comes from the readers, not from memory.** `products.category` is `taxonomy_category`;
  sizes and colours are `options`/`option_values`; images carry `option_value`, `widths`. The allow-list is derived in
  task 2 from `listProducts` and `productFactsIn` (`src/lib/queries/catalogue.ts`) against `schema-catalogue.ts`:
  products (adds `options, option_values, type_id, publish_at, taxonomy_category`), variants (adds `sku, lead_min_days,
  lead_max_days, preorder_cap, option_values`; never `unit_cost`), product_images (`widths, option_value`), collections
  (`match_all`), collection_products, **product_types (`name`)**, **product_colours (`hex, value, family`)**,
  **product_attributes** (rule collections' counts): eight tables, each with the two policies. `builderProducts` and
  `builderCollections` call the page's own `listProductsWith(tx, …)` / `listCollectionsWith(tx, …)` (extracted from
  today's readers), never a copy of the SQL. § 80, the `check:tenant` allow-list and KISS say eight.
- **High → the store switch** is `switchStoreAction` (`src/app/choose/actions.ts`) and `/choose` (also Clients' "Open
  store"): on `console.open`, in `BUILDER_DOORS` (same as security M5). `api/console/tenant` is TenantCheck's read, not a
  switch; it stays.
- **High → the refusal is structural, not a branch.** `app_access_for` keeps returning Builder rows, but `accessOf` puts
  them in a separate list, `builds`, never in `memberships`. **`MEMBER_ROLES` and `MemberRole` stay as they are**;
  `SHOP_ROLES = [...MEMBER_ROLES, 'builder']` builds the members CHECK. So `requireMember` cannot carry a Builder's
  membership at all (no `Record<MemberRole>`, `seesCosts` or `ROLE_LABEL` change; a Builder's label is `Builder` in
  `BUILDER_LABEL`), and every legacy page has the same answer for a Builder-only store as for a stranger, plus the
  Builder's panel when the cookie names a `builds` store. The store choice reads both lists, so the cookie can never fall
  through to another store.
- **High → a Builder's pages live apart**: `_builder/*.tsx` beside each door (layout, products, collections, preview,
  `/console` redirect). `check:capabilities` lets those files import only `src/lib/queries/builder.ts`, the preview's
  loaders through `previewTenantOf`, and UI. `places` (the person's own stores, with ids, for the switcher and
  TenantCheck) is the one tenant id a Builder page holds; it never reaches a reader (the gate).
- **High → the preview runs as `frata_app`**, which is a deviation from ADR-0015 § 3 and § 5. It is now a row in Deviations
  and owner question 5. It shows what shoppers see: drafts, a product's availability (stock less held pieces) and the
  best-seller order, the last two derived from orders, as on the live store.
- **Medium →** an import allow-list gate for the preview page and `preview-body.tsx` (lanes A and B change what they
  import); the partner CHECK moves to the custom migration (hand-written in 0124, unknown to drizzle-kit); **deploy order:
  migrations first** (old code on the new database is safe: no tuple holds `builder`; new code on the old database fails
  closed on `role "frata_builder" does not exist`); task 2 reads `select version()` and writes `with inherit false, set
  true` on PG16+; `has_owner` for the Builder's stage (security L10); the sweep enumerates `route.ts` and `(lookpreview)`
  and `/choose` (security M7). **Today's Lead already gets the brand owner's email** from `app_partner_clients` (0129),
  against frata-architecture § Partners: reported to the orchestrator as a separate finding, outside T1c's scope unless
  the owner says fix it here (question 6).
- **Medium → merge order with lane B:** lane B's spec names `content.write` in `CAPABILITIES`; T1c lands first and lane B
  adds its line to the table (the snapshot test makes the addition explicit).
- **Low →** the definer count is about 194, all already revoked from PUBLIC (the deviation's reason now says that); the
  frozen `===` list adds `settings/people/page.tsx` (30, 39, 42, 51, 52, 58: the Builder's row), `settings/page.tsx:77`,
  `notifications/page.tsx:17`, `apps/gst/page.tsx` (52, 69, 115), `delivery_zones/page.tsx:35`, and the `accessOf`
  callers outside `requireMember` (the workspace layout, `start/page.tsx`, the console layout); `app_pm_live` needs no
  change; `PARTNER_CAN.createShop: ['owner', 'lead']` hides "New client store"; the refusal log runs once per request
  from a `cache()`d function that the page names its route pattern to; `orders.work` is renamed `shop.work` (ANY_MEMBER
  covers orders and the catalogue).

**tenancy-auditor (FIX BEFORE MERGE; no reachable leak as drawn; check:tenant and check:actions clean; verify:tenancy
green on a throwaway PG16; a fresh role there executes no function and reads no table):**
- **High → a Builder's pages hold no usable tenant id**: `places` for a Builder carry an opaque store handle the
  switcher posts back and `switchStoreAction` resolves against the person's own `accessOf` lists (never a trusted form
  id); TenantCheck compares the handle. `check:capabilities` refuses any `src/lib/queries` import in Builder files but
  `builder.ts` and the named preview set (as architecture's `_builder/` rule).
- **High → every preview loader is named** and frozen by the import gate: `previewShop`, `previewCatalogue`,
  `previewProduct`, `previewLook`, `previewBestSellers` (reads `orders`/`order_lines`, returns ids), `previewVideos`,
  `previewPages` (hidden pages too: a Builder builds them), `coreProduct`'s `heldByVariant` and `showcase` (shopper-safe
  offer fields). `previewPage` is shared with `(lookpreview)/theme-preview`, which stays CAN_BUILD. e2e checks the
  Builder's preview HTML for no seed order number, phone, cost or order total. Best-seller order is in owner question 5.
- **Medium → `app_notice_members` and `app_member_email` become allow-lists** (`role in ('owner','admin','staff',
  'partner','accountant')` as each needs today; 0096 is a deny list, `role <> 'accountant'`), in the SAME migration that
  first allows a `builder` row.
- **Medium → `app_member_role()` revokes from `public, anon, authenticated, service_role`** and grants to `frata_app`,
  `frata_builder`. § 80 asserts generically: `frata_builder` executes no function in any schema but its two, holds no
  privilege on any relation but the eight, no column outside the allow-list, no CREATE on `public`, no sequence. The
  same read-only probe runs against the project after the orchestrator applies the migrations (Supabase's own schemas:
  auth, extensions, pgbouncer, vault), and its output goes in the release report.
- **Medium → a separate login for Builders** (owner question 7). `frata_builder` becomes a LOGIN role with its own small
  pool (`builderDb()`, as `adminDb()` for `frata_admin`), so a Builder transaction has no `frata_app` to `reset role`
  back to, and `frata_app` holds no membership in it (M4's inheritance question goes away). Cost: one secret
  (`DATABASE_URL_BUILDER`) and one pool of `max: 2`. If the owner says no, the plan falls back to `set_config('role')`
  inside a `frata_app` transaction with the gate on `reset role`.
- **Low → raw `stock` is shown to a Builder** (the list's stock column; shoppers see "Only N left" at 3 or fewer):
  owner question 8. `hsn` and `gst_bps` are not granted.
- **Low →** `requireCapability` and `requireMember` share `currentAccess`'s per-request cache, so the layout and the page
  pick the same store; `app_shop_people`'s sort list gains `builder`; `app_my_partner` admits `builder` with the lead's
  blanking (as security H2); `has_owner` (as above); the sweep is generated from every `page.tsx` and `route.ts`, the
  partner workspace and `/choose` included.

**security-reviewer (FIX BEFORE MERGE; gates clean):**
- **H1 → the role is bound by the database, not by care.** A CHECK cannot read `partner_members`, so: a constraint
  trigger on `members` (insert, update) and on `partner_members.role` (update) refuses a row whose `role` is not
  `builder` exactly when its person's role is `builder`; `revoke update (role) on members from frata_app` (only definers
  move a role); `app_partner_set_role` locks the person `FOR UPDATE` first (as accept and assign do); § 80 asserts no
  row disagrees, and that a direct `update members set role` as `frata_app` raises.
- **H2 → `app_my_partner` joins the definer table** (returns `builder`); `partners.ts` maps each role by name and an
  unknown role REFUSES (today anything not `lead` reads as `owner`); `memberRole: PartnerRole`; a unit test per role.
- **M3 → the lock on functions is PUBLIC's revoke on each definer**, so § 80 checks `has_function_privilege` for every
  `prosecdef` function in every schema and `has_table_privilege`/`has_column_privilege` over all of `pg_class` (views
  included) for `frata_builder` against the allow-list; the migration adds `alter default privileges revoke execute on
  functions from public`.
- **M4 →** `grant frata_builder to frata_app with inherit false, set true`; § 80 proves an owner and the storefront still
  read products; task 2 reads production's `pg_roles`/`pg_auth_members` for `frata_app` (read only) and the report names
  the result.
- **M5 → the store switch is `src/app/choose/actions.ts` (`switchStoreAction`) and `/choose`**, not
  `api/console/tenant` (which answers `{tenantId}` and stays as it is). Both move to `console.open` (they choose only
  among the person's own stores) and join `BUILDER_DOORS`; e2e switches away from a Builder store.
- **M6 → the refusal log carries the route PATTERN** (`/console/orders/[number]`), never the path or its query, the
  capability and the member id; `errName` only; one line per request.
- **M7 → the sweep enumerates every `page.tsx` AND `route.ts`** under `(console)`, `(lookeditor)`, `(lookpreview)` and
  `api/console` (orders/pdf, rows, peek, filter-values, billing invoice, theme-preview included), expecting each one's
  own refusal; a unit test that `requireMember`, `asMember`, `asModule` and `moduleGate` refuse a Builder for every
  tuple; e2e posts three actions (an order write, a cost write, an export).
- **M8 → the preview's cost-free claim gets its own proof:** a type test that `Store*` types carry no cost key, and e2e
  asserting the Builder's preview HTML holds none of the seed's cost or fee values.
- **L9 → `app_partner_set_role`** refuses any role but `lead`/`builder`, the owner row, the caller's own row and another
  partner's person; covers invited people; Lead → Builder revokes the shop invites the person made (as assign-off
  does); the person is told by the existing partner notice (`app_partner_notify`); § 80: a Builder setting its own role
  and a role of `owner` are refused.
- **L10 → `app_partner_clients` for a Builder** also nulls `share_months`, `notice_days`, `share_starts_at`, and returns
  `has_owner` (boolean) so the stage stays right without the owner's email (the stage reads it, not the email).
- **L11 →** set-role has its own limit (`partnerRole`, fail closed); the invite's role is `z.enum(['lead','builder'])`
  (`partners.ts` hard-codes `'lead'` today); `builderProducts` takes `q` ≤ 100, enum sort and view, a bounded page.
- **L12 →** corrected: `app_handover_invite` is owner-only (0129).

## Repetitive work → agents and scripts
| Chore | Now |
|---|---|
| Finding a console route a Builder reaches | `check:capabilities` (`BUILDER_DOORS`) + e2e `86-builders`' sweep over the folders |
| Granting `frata_builder` a column by mistake | `check:tenant` allow-list + § 80 |

## Practices recorded in skills (task 7)
- architecture: a role that must not see a class of data gets a database role with column grants, never a filter; its
  door is an `Actor` whose tenant no page can read; the role is set with `set_config('role', …, true)` in the same
  statement as the tenant.
- design language: a role's console shows only what opens for it (nav from capabilities); a page it can't open is its
  own panel in that shell.
- testing: a route sweep for each restricted role, generated from the app's folders, never a hand list.
