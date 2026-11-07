# M2·0 Modules foundation: Apps, packages and add-ons
Status: draft · Date: 2026-11-07 · Mockup: pending · Approved: owner chose M2 and "tiers plus add-ons" (2026-11-07); spec pending
Research: `docs/research/2026-11-07-fashion-modules-and-next-milestone.md` § 3

## Goal
Enabling. Every M2 module (Communication first, then Ship and RTO Shield) needs one way to be granted
by a package, switched on by the merchant, and paused by Frata. **Measure:** a module is added by writing
its registry entry and its own folders, with no edit to core pages (`check:modules`). A merchant can see and
switch every module on one page.

## Job
A merchant sees what Frata can do for their shop, what their plan includes, and turns each part on or
off. Frata sells the same parts as tiers plus add-ons without code changes.

## Research (dated)
- **Shopify** (shopify.com/in/pricing, 2026-11-05): most features are free first-party apps on every plan.
  Tiers change fees, staff accounts and POS. Specialised jobs go to the App Store, each app with its own bill.
  **Taken:** one place listing every capability, each with its own on/off and setup. **Not taken:** a
  separate bill per app.
- **Dukaan** (mydukaan.io/pricing, offer to 2026-11-15): features gated by tier only, no add-ons.
  **Taken:** tiers include whole modules. **Not taken:** forcing a tier jump for one feature.
- **Shiprocket** (©2026): each product is billed separately, usage passed through. **Taken:** usage
  (WhatsApp messages, freight) stays the vendor's bill or a pass-through, never hidden in the plan.
- **Codebase:** `plan_versions.features` (text[], CHECK) and `canUse()` exist; Admin edits features per
  plan version; nothing in the console reads them yet. The outbox has a sender registry by `kind`.

## Design (mockup to come: Console › Apps, a module's setup, Admin › merchant › Modules)

### 1. The registry (pure, one list)
`src/domains/modules/registry.ts`. Each module is data:
```ts
{ key: 'communication', name: 'Messages', job: 'WhatsApp with your customers, one inbox for your team',
  billing: 'included' | 'add_on' | 'usage', usage?: 'Meta bills messages',
  dependsOn: [], status: 'now' | 'next', setup: '/console/apps/communication',
  nav?: { group: 'Today', label: 'Inbox', href: '/console/inbox', icon: 'inbox' },
  slots: ['order.side', 'customer.side'] }
```
The `plan_versions.features` CHECK and the add-on CHECK are built from `MODULE_KEYS` (the `sqlList`
pattern), so TypeScript and Postgres can't drift. Today's features (`rto_shield`, `size_fit`,
`cart_flows`) become registry entries with status `next`.

### 2. Three facts, stored once; access derived
| Fact | Table | Who writes |
|---|---|---|
| The plan **includes** the module | `plan_versions.features` (exists) | Admin, by plan version |
| The shop **bought or was given** an add-on | `tenant_addons` (tenant_id, module, addon_price_id, starts_at, ends_at, trial_ends_at, created_by) | Admin now; Razorpay subscriptions in Phase 6 |
| The merchant **switched it on** | `tenant_modules` (tenant_id, module, enabled_at/by, disabled_at/by). One open row per module (partial unique) | Owner or admin, in Console › Apps |
| Frata **paused** it platform-wide | `module_pauses` (module, paused_at/by, reason, resumed_at) | Frata admin |

Add-on prices are versioned like plans: `addon_prices` (module, version, monthly_price paise, created_at),
a platform table that Admin writes and the website reads. A price change is a new version, so nothing a
merchant agreed to moves.

`moduleAccess(facts, now)` in `src/domains/modules/access.ts` (pure) returns, per module,
`{ granted, how: 'plan' | 'add_on' | 'trial', on, paused, usable, why }`, where
`usable = granted ∧ on ∧ ¬paused ∧ every dependency usable`. **There is no stored "enabled" flag anywhere
else.**

### 3. Reading it (one round trip, every surface)
- `shopModules(tenantId)` in `src/lib/queries/modules.ts`, cached per request (React `cache`), returns
  the facts and the derived access. The console layout, pages and actions share one read.
- **Actions:** `asModule(module, roles, what, work)` wraps `asMember`. It refuses in words when the module
  isn't usable ("Turn on Messages in Apps"), and is listed in `check:actions` chokepoints.
- **Storefront:** a shop's modules join its cached settings and its tag. Turning a module on or off
  calls `refreshShop`.
- **Outbox and cron:** each sender is registered with its module. The sweep skips rows whose module isn't
  usable for that shop and marks them `skipped: module off` (dead, with the reason), never retrying forever.
- **Nav:** a module's nav item appears only when usable (design rule: "a row is added when its page exists").

### 4. Extension slots (modules plug in; core never imports a module)
- Named slots: `order.side`, `order.timeline`, `customer.side`, `product.card`, `storefront.product`,
  `checkout.step`, `home.tile`.
- `src/components/modules/slots.tsx` maps slot → each usable module's component (dynamic import). A core
  page renders `<Slot name="order.side" ctx={…} />` and nothing else.
- **`check:modules`** (new gate) fails if any file outside a module's own folders imports a module's code,
  except `slots.tsx` and the nav builder.
- A module's folders: `src/domains/<module>/`, `src/lib/queries/<module>.ts`, `src/lib/connectors/<vendor>/`,
  `src/app/(console)/console/<module route>/`, `src/components/modules/<module>/`, and its migration.

### 5. Console › Apps (owners and admins)
- One list, grouped by job (Sell, Deliver, Talk, Grow).
- Each row: the pictogram on its tile, the name, a one-line job, a badge (In your plan / Add-on ₹X/mo /
  In Growth / Next), and a switch, or the one action ("Set up", "Add for ₹X/mo", "See Growth").
- Turning a module off opens a dialog that names what stops ("Shoppers stop getting WhatsApp updates.
  Queued messages are cancelled."), with the buttons "Turn off Messages" / "Keep Messages".
- Turning one on goes to its setup when it has one. Every change writes `audit_events`.
- Partners and staff see the page read-only (CAN_MANAGE changes it).

### 6. Admin
- Plans: the feature checkboxes come from the registry.
- Merchant › Modules: what's granted and how, the merchant's switches, and "Give a 30-day trial of X" (a
  `tenant_addons` row with `trial_ends_at`).
- Modules: pause or resume one platform-wide, with a reason. The merchant sees "Paused by Frata · we're on it".

## Design review (frata-planning § 3)
- **UI/UX:** one page, one switch per row, the dialog only for turning off (it loses messages). States:
  every module off (empty is impossible: core is always on), not in plan, trial (with days left),
  paused, needs setup, error. Phone: rows, switch at the end. The voice and graphic language apply.
- **Tenancy:** `tenant_addons` and `tenant_modules` carry tenant_id, grant, RLS and policy in one migration.
  frata_app can select both and insert/update `tenant_modules` for its own tenant. `tenant_addons` is
  written by frata_admin only. `addon_prices` and `module_pauses` are platform tables: frata_app has select
  only, read through a definer (same as plans). Proofs go in `tenancy.sql`.
- **Modularity:** pure registry and access; one query; slots; `check:modules`.
- **SSOT:** "usable" is derived only in `moduleAccess`. Prices are versioned rows. Features CHECK built from the registry.
- **YAGNI:** no per-module settings framework (each module owns its settings table), no marketplace for
  third-party modules, no per-seat billing yet (seats: see Communication), no charging (Phase 6).
- **KISS:** four small tables, one function, one wrapper. Slots are a map, not a plugin system.
- **Scale:** one query per request for modules (about 10 rows per shop). Indexes on (tenant_id, module).
- **Performance:** cached per request. The storefront reads modules with the shop's cached settings.
- **Reliability:** a pause or an off switch stops a module's outbox rows with a reason, never silently.
- **Security:** CAN_MANAGE switches. `asModule` is a chokepoint (`check:actions`). Admin trials are audited.
- **Unit economics:** price is data. Plan and add-on revenue is derived from the same rows Phase 6 will
  bill. **`unit-economics-reviewer` on the proposed add-on list and prices** before the mockup is final.
- **Blast radius:** `plan_versions` features CHECK migration (existing rows keep their values); Admin plan
  pages; console layout (nav from the registry); outbox sweep (module check). Existing `rto_shield`,
  `size_fit` and `cart_flows` keep their keys.

## Out of scope
Charging (Phase 6). Third-party modules. Per-module usage metering beyond what vendors bill.

## Owner calls
1. Add-on list and prices (proposed: True Profit, Marketplace export, Reviews & UGC, Assisted DM orders;
   prices from `unit-economics-reviewer`).
2. Is Messages (Communication) **in every plan** (recommended: messaging is how COD gets confirmed, which is
   the #1 problem), with team seats by tier and extra seats as an add-on? See the Communication spec.
