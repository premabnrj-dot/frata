# Partner foundations: signup, workspace, handover (F1–F3)
Status: built · Date: 2026-11-07 · Mockup: https://claude.ai/artifact/TPuqJEDpbNnor97gpjJnAj · Approved: owner, 2026-11-07 ("Mockup approved, please execute"; plain voice, explanation in tips, graphic-led /partners)
Research: `docs/research/2026-11-07-partner-program.md`

## Owner decisions (2026-11-07)
1. **The merchant owns the store.** The partner is a member with the `partner` role.
2. **20% of what Frata collects from the merchant, for 24 months.**
3. **F1–F3 are built now**, before billing (Phase 6). Statements and payouts wait for Phase 6.

## Owner calls (O1–O3 taken as recommended when the owner said execute, 2026-11-07; each is a constant in PARTNER_TERMS)
- **O1 When the 24 months start:** at the shop's first payment to Frata (recommended:
  building time doesn't burn the partner's window), or at handover. Until Phase 6 bills,
  "first payment" is read as the moment the shop opens (`shop_settings.published_at`),
  which already requires choosing a plan.
- **O2 After the merchant removes a partner:** the share continues 90 days, then stops
  (recommended), or it stops at once. Either way the end date is capped by the 24 months.
- **O3 Stores in progress per partner:** 10 at once (recommended), so a partner can't park store addresses.
- **O4 The public page shows a worked example** (₹876/month on a Launch brand). It's
  marked "Example", and its figures come from the plan rows, not hard-coded.

## Goal
Distribution. It cuts onboarding cost per merchant (frata-unit-economics rule 7) and serves
the "without a developer" half of the North star (problems 3 and 5: catalogue ops and a
premium storefront, done by someone the brand already trusts).
**Measure:** stores created by partners and handed over per month; share of new shops that
open through a partner; partner-built shops' opened-to-first-order time against direct shops.

## Job
A freelancer or agency builds a fashion brand's Frata store in their own workspace, hands it
to the owner, and keeps working on it, with their share of Frata's fee recorded from the start.

## Research (dated, current)
- **Shopify Partners** ([earnings FAQ](https://help.shopify.com/partners/help-support/faq/earnings),
  [for agencies](https://www.shopify.com/emea-rec-for-agencies), checked 2026-11-07): 20%
  recurring, earned only by building a development store and transferring it; one dashboard for
  every client store. **Taken:** attribution by *building* the store, a transfer step, and one
  workspace listing every store.
- **Wix Studio Partner Program** ([terms, updated 2026-01-01](https://www.wix.com/partner-program-terms-of-use)):
  one workspace for every client site; the client is invited to their own site.
  **Taken:** the client accepts an invite into a site already built.
- **Shopify collaborator access** (as recorded in the Phase A spec, 2026-11-06): the owner
  approves scoped access and can remove it. **Taken:** the partner's access is scoped, and the owner removes it.
- **Codebase:** `members` already holds one row per (tenant, user); `app_access_for` returns
  every membership; the `frata_tenant` cookie selects among them (ADR-0007). `invites` already
  carries a role and is claimed at sign-in by a confirmed email. `app_create_shop` refuses
  a second shop per person (`has_shop`). `shop_settings.published_at` marks a shop as open.
  The console has no People page yet.

## Design (mockup, 12 artboards)
1. **frata.in/partners**, the public page: one promise, "Apply to be a partner", a worked example,
   How it works (build → hand over → earn), Now/Next, the rules in plain words, FAQ. Follows the
   website rules (Now/Next, + 18% GST, "only on delivered orders", WhatsApp link, no video, no chat widget).
2. **Apply**, after the usual email + 6-digit code sign-in. It asks only what review uses: name,
   studio name, WhatsApp, city, what you do (chips), one work link, brands now, terms accepted.
   The side panel lists what isn't asked yet (PAN, bank, GSTIN: when the first share is due).
3. **Application received**: "In review", the WhatsApp number we'll reply on, and what happens next.
4. **Admin › Partners**: tabs To review / Approved / Declined. The detail panel has
   "Approve Arjun Studio" and "Decline, with a reason". The decision is written to Activity.
5. **Partner workspace › Clients**: tabs derived from state (All, Building, With the owner,
   Open, Ended). The row shows store, stage badge, owner, plan, "20% until Aug 2028", and Open store.
   5b: on a phone, rows and a bottom bar (Clients, Switch store, More). 5c: the empty first day.
6. **New client store**: the same three fields as `/start` (name, address, pickup pincode). The
   button names the store. The side panel says the store is recorded as built by the partner
   from now, that it stays "Opening soon", and that plan, Razorpay and KYC are left to the owner.
7. **Building banner + Hand over**: an info bar on every console page of a store with no owner.
   The dialog asks for the owner's email and lists what changes; its buttons are "Send Kesar
   Studio's handover invite" and "Keep building".
8. **The owner accepts**: who built it, what the owner and the partner can each do, "your price
   is the same", "remove them at any time", then "Accept Kesar Studio" / "Not now".
9. **Settings › People** (new): owner, partner ("Built this store"), staff. The remove dialog
   names both ("Remove Arjun Studio" / "Keep Arjun Studio") and says what stays.
10. **F3 store switcher**: in the account block at every width and in More on phones. It
    shows only with 2+ places to go, adds search at 8+, and sets the existing `frata_tenant` cookie.

### Stage of a client store: derived, never stored
`src/domains/partners/stage.ts` (pure) takes the timestamps:

| Stage | When |
|---|---|
| Building | partner link active, no owner member, no open owner invite |
| Invite sent | an owner invite open (not accepted, revoked or expired) |
| With the owner | owner member exists, `shop_settings.published_at` null |
| Open | `published_at` set |
| Ended | link `removed_at` set |

`shareWindow(link, openedAt)` lives in the same module. It returns `{ startsAt, endsAt } | 'not_started'`:
start = `openedAt` (O1); end = start + `share_months`, capped at `removed_at + notice_days` (O2).
The Clients list and the future statements both read this one function.

### Who may do what (F2), copied into each action file's header

| Action | owner | admin | partner | staff |
|---|---|---|---|---|
| Products, collections, orders, shop look, policies, delivery settings | ✓ | ✓ | ✓ | per existing rules |
| Online payments (Razorpay keys), plan, opening the shop | ✓ | ✓ | — | — |
| People: invite or remove members | ✓ | ✓ | — | — |
| Remove the partner | ✓ | — | — | — |
| Hand over (invite the owner) | — | — | ✓ while there is no owner | — |
| Delete a store | only while Building, with no orders: the partner | | | |

New tuples in `src/domains/tenancy/roles.ts`: `CAN_BUILD = ['owner','admin','partner']` for
catalogue and shop-look actions. `CAN_MANAGE` stays `['owner','admin']` and keeps
payments, plan, publishing and People. `ANY_MEMBER` gains `partner` only after every caller has
been read (blast radius).

## Data (F1)
- `partners`: platform table. `id`, `user_id` unique, `name`, `business_name`, `phone`,
  `city`, `services text[]` (CHECK against a const tuple), `work_url`, `brands_now` (CHECK),
  `terms_version`, `agreed_at`, `applied_at`, `approved_at`/`approved_by`,
  `declined_at`/`declined_by`/`decline_reason`. Status is derived from these timestamps.
  `frata_app`: no table grant; it's read only through definer functions taking no ids
  (`app_my_partner()`, `app_partner_apply(...)`). `frata_admin`: select, plus update of the
  decision columns.
- `partner_links`: tenant data with a platform writer. `id`, `tenant_id` → tenants,
  `partner_id` → partners, `created_at` (**attribution: set once, when the store is created**),
  `share_bps` (2000), `share_months` (24), `notice_days` (90), snapshotted from
  `PARTNER_TERMS` at creation so later terms never rewrite a store's. Also `removed_at`,
  `removed_by`. A unique partial index on `tenant_id where removed_at is null` means one partner per store.
  RLS tenant policy: `select` for `frata_app` (People shows "Built this store"); writes only
  through `app_partner_create_shop` and `app_remove_partner`. `frata_admin`: select.
  - This replaces the research note's `tenants.acquired_by_partner_id`. One fact, one place:
    the link row *is* the attribution, so there's no second copy on `tenants`.
- `members_role` and `MEMBER_ROLES` gain `partner`. `invites_role` doesn't: a partner is never
  invited, only made by `app_partner_create_shop`.
- **Definer functions** (`set search_path = ''`, revoke from public/anon/authenticated):
  - `app_partner_create_shop(uid, name, slug, pickup)` checks the user is an approved partner,
    has fewer than 10 Building stores (O3), and that the slug is valid and free. It creates the
    tenant, its settings and a partner member, and inserts the link, in one transaction, under
    the same advisory lock as `app_create_shop`. Partner stores don't count against `has_shop`.
  - `app_partner_clients(uid)` returns, for links of the caller's own partner row only: tenant id,
    name, host, link created/removed, the open owner invite's email and expiry, the owner's email,
    `published_at`, and the plan name. **No order, product or shopper data.**
  - `app_remove_partner()` reads `app_current_tenant()`. Only an owner may call it. It sets
    `removed_at` and deletes the partner's `members` row in the same transaction, and writes `audit_events`.
- The handover uses `invites` (role `owner`, `created_by` = partner). `app_claim_invites`
  already makes the member. Refused when the store already has an owner.

## Routes
- `/partners`: public page on the console host, static (`revalidate`), with plan figures read from `publicPlans()`.
- `/partners/apply`: `requireUser`, then the form, `applyAsPartner` action (Zod), rate-limited.
- `/partner`: the workspace. New `requirePartner()` (approved only) in `src/lib/auth/`. Same
  `AppShell`, with a `PARTNER` tag in the info pair (Admin keeps ink + STAFF). Pages: Clients, Your details.
  Open store sets `frata_tenant` to a tenant the user is a member of and goes to `/console`.
- `/admin/partners`: `requireStaff`, reads through `src/lib/admin/partners.ts`.
- `/console/settings/people`: owner and admin see members. Owner-only Remove partner.
- `/choose` and the F3 switcher are one component, fed by `app_access_for` + `app_my_partner()`.

## Design review (frata-planning § 3)
- **UI/UX:** one primary action per screen (Apply · Send application · Approve ·
  New client store · Create <store> · Send <store>'s handover invite · Accept <store> ·
  Remove <partner>). Each has a state: empty (5c), many (5), phone (5b), in review (3), invite
  expired ("Send again"), ended (dimmed with colour, not opacity), and no permission (a partner
  opening Online payments sees a Panel: "Only Kesar Studio's owner can connect payments"). Buttons
  name the store; cancel buttons name the safe outcome. The merchant's words: store, owner,
  partner, share. Never "tenant" or "link". Status always uses a badge with words.
- **Tenancy:** the tenant id still comes only from `requireMember` (membership or support) and
  the host. The partner workspace's one cross-tenant read is `app_partner_clients`, which is
  keyed by the caller's uid, returns Frata-owned facts only, and runs as a definer with no id
  parameters for other tenants. `partner_links` ships with grant, RLS and policy in its migration;
  `partners` has no `frata_app` grant. Add both to `scripts/verify/tenancy.sql`: a partner of A
  can't read B's link, member rows or orders; a removed partner's cookie for A selects nothing.
  **`tenancy-auditor` runs on this spec before the plan.**
- **Modularity:** pure `src/domains/partners/{stage,share-window,terms}.ts`; reads in
  `src/lib/queries/partners.ts` and `src/lib/admin/partners.ts`; actions in each route's `actions.ts`.
- **SSOT/DRY:** attribution lives only in `partner_links.created_at`. Stage and share window are
  derived from timestamps in one module. Terms are snapshotted on the link from one
  `PARTNER_TERMS` const. The public page's example is computed from plan rows plus `share_bps`,
  never typed.
- **YAGNI (out):** statements, payouts, KYC/PAN/bank, TDS, tiers (25/30%), first-client bounty,
  referral links, "Hire a partner" directory, client reports, agency staff seats, moving an
  existing store to a partner. Each returns with Phase 6 billing, or when a design partner asks twice.
- **KISS:** a partner is a member with a fourth role, plus one table about the partner and one
  row per store. No new auth path, no new cross-tenant role, and the switcher reuses the cookie.
- **Scalability:** `partner_links` grows one row per store. Index `(partner_id)` and the unique
  partial index on `tenant_id`. `app_partner_clients` is one query per page view. At 500
  partners × 20 stores it's 10k rows.
- **Performance:** Clients is one round trip (the definer). The switcher adds none (already
  in `app_access_for`). `/partners` is static.
- **Reliability:** approval and handover send the usual Supabase sign-in email (`sendSignInLink`, as Admin
  does for owners). If it fails, the approval or invite still stands, the screen says the email did not
  send, and signing in at /login shows the workspace or the store. "Send again" re-invites.
- **Security:** each action uses `requireUser`/`requirePartner`/`asMember(roles)`/`requireStaff`
  and is listed for `check:actions`. Zod on every input. `app_remove_partner` takes no ids.
  A partner can't invite members, change the owner or reach payment keys (the roles table
  above, enforced in actions, not by hiding buttons). The partner terms version is stored
  with `agreed_at`.
- **Unit economics:** nothing is charged or paid in this phase. It records a 20%/24-month
  liability per opened shop. **`unit-economics-reviewer` runs on § Owner decisions and O1/O2**
  (a liability starting at shop open, while contribution per ₹100 is unvalidated).
- **Blast radius:** `MEMBER_ROLES` and the `members_role` CHECK (every `requireMember` caller,
  27 files use `ANY_MEMBER`/`CAN_MANAGE`). The console layout gets the building banner and
  switcher. `app_access_for` output gains nothing, but its consumers must render a `partner`
  role label. `/choose`. `app_claim_invites` gets a new refusal case (owner exists).
  Footgun: adding `partner` to `ANY_MEMBER` silently widens every staff-level action. Read each first.

## As built (2026-11-07)
Migrations 0022 (tables) and 0023 (grants, RLS, functions, trigger). Review findings and their fixes are in
the plan. Handover acceptance is explicit (`/handover`), never claimed at sign-in. The 24 months start at the
shop's FIRST opening (`partner_links.share_starts_at`, set once by a trigger).

## Phases (each usable on its own)
- **P1 Stores and people:** the `partner` role (F2) with no partner yet, Settings › People,
  and the F3 switcher. Useful today to owners with two brands and to staff who are members.
- **P2 Partner signup and workspace:** `/partners`, apply, Admin review, `partners` +
  `partner_links` (F1), the Clients list, new client store, handover, and Remove partner.

## Regression net first (rule 5)
e2e before the change: sign-in → `/choose`; staff support session; create shop via `/start`
(still one per person); claim an invite. Unit: `stage()` and `shareWindow()` on fixtures
(not started, open, removed inside and outside 90 days, 24-month cap).

## Practices to record in skills on approval
- frata-design-language: "Partner workspace looks like the console with a `PARTNER` info tag;
  a store with no owner shows the building banner on every page."
- frata-architecture: "A role's permissions are a tuple in `roles.ts`; adding a role means
  reading every caller of the tuple it joins."

## Out of scope
See YAGNI. Also: a partner-branded storefront credit ("Built by …" in the shop footer).
That waits until a merchant asks, and it would be owner-controlled.

## Facts used
Shopify Partners 20% via development-store transfer: help.shopify.com/partners/help-support/faq/earnings,
shopify.com/emea-rec-for-agencies, checked 2026-11-07. The duration conflicts between sources and is unverified.
Wix Studio partner terms updated 2026-01-01: wix.com/partner-program-terms-of-use, checked 2026-11-07.
