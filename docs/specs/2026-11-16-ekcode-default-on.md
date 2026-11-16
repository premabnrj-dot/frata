# EkCode on by default
Status: active, reviews folded (architecture CHANGES NEEDED, unit economics NEUTRAL for merchants), owner's calls answered 2026-11-16 (owner, 2026-11-16: "can we keep ekcode default order processing setup and by default it should remain
active") · Date: 2026-11-16 · Mockup: none (no new screen: Apps › EkCode and checkout already draw On, Off and the
sign-in step; approved earlier) · Plan: § Tasks below

## Goal
Ranked problem 4, mobile checkout conversion (and 1, COD losses: a shopper known to EkCode is a known phone and
address). Today a store must find EkCode under Apps and switch it on, so most stores never offer it. Measure: the share
of open stores whose checkout offers EkCode (from ~the few that switched it on to every store that hasn't turned it
off), and EkCode's share of placed orders, each a month after release.

## Job
Every store's checkout offers "Continue with EkCode" from the day it opens, as the default way a shopper is filled in,
unless the store turned EkCode off.

## Preconditions (architecture review, 2026-11-16: BLOCKER 1)
Every store's own privacy page says details go "only with the courier" (`src/domains/policies/render.ts`, the privacy page's courier line);
EkCode's "Save this address to EkCode" starts ticked, so a store offering EkCode needs its notice to say so. Building
can start now (every store is test data, owner 2026-11-15); **a store with real shoppers offers EkCode only when:**
- (a) counsel has answered `docs/setup.md` § C1's A4(a)–(c) (as today for EkCode at all) **and** a new A4(d): may Frrata
  switch on its own data-fiduciary product in a merchant's checkout by default;
- (b) the store's privacy page says it: `PolicyFacts.offersEkcode` (filled like `countsVisits` and `zones`: usable and
  configured) adds an EkCode paragraph worded with counsel (EkCode, the `ek_v` browser id and the daily exposure beacon);
  the Storefront API lists the policies as links only (`2026-12/map.ts`), so its contract is unchanged (`check:api`);
- (c) a store that rewrote its privacy page (`shop_policies`) gets a console notice to add the paragraph;
- (d) answered by the owner: no Notice (every store is a test store); the signup terms gain the line and their version.

## Owner's answers (2026-11-16)
1. **"yes, frrata switch on it's own shopper sign in service in merchant's checkout by default"**: A4(d) is the owner's
   ruling. Counsel's A4(a)–(c) stay the gate for real shoppers, as for EkCode today.
2. **"already stores are just test stores nothing needs notice"**: every store flips at release, with no Notice and no
   opt-out window. The merchant terms a new store accepts at signup say EkCode is on by default and can be turned off in
   Apps (one line; the terms version bumps with it).
3. **Stores without a paid plan: "Yes."** They get the default, under the Launch cap (100 codes a day).
Preconditions (b) and (c) stand: each store's privacy page says it offers EkCode before real shoppers reach it.
**(d) is open** (orchestrator, 2026-11-16): Frrata has no merchant terms yet (signup shows none, records no acceptance,
has no version). When counsel writes them (`docs/setup.md` § EkCode A4(b)), they include "EkCode is on by default; turn
it off in Apps", and signup records acceptance with a version. No signup line until then.

## Design
- **The default is data in one place:** the registry gains `defaultOn: true` for `ekcode` (`src/domains/modules/registry.ts`).
  `moduleAccess` reads a module as **on** when it has an open switch row, **or** when it is `defaultOn` and the store's
  latest switch row is not a closed one (the store never turned it off). Nothing new is stored; "enabled" stays derived
  (modules-foundation § 2).
- **A store's choice stands.** A store that turned EkCode off before stays off. Turning it off when it has no row writes
  one closed row (enabled and disabled at the same moment, by the same person), so the default never comes back on its
  own; turning it on again writes an open row, as today.
- **One rule, read from raw facts** (review M2): the unique open index allows one open row, so "turned off" is "has a row,
  none open". The facts read `select module, bool_or(disabled_at is null) from tenant_modules where tenant_id = $1 group
  by module` (no ordering, no clock) into `switchedOn` (open) and `touched` (any row), both required fields; one pure
  row → facts mapper in `src/domains/modules/` serves `src/lib/queries/modules.ts` and `src/lib/admin/modules.ts`;
  `moduleAccess` decides `on = open || (defaultOn && !touched)`. On, off, on, off reads off; off twice writes two closed
  rows, harmless.
- **The default stays in the registry** (M3): `app_admin_ekcode_shops` takes `p_default boolean` from
  `MODULES.ekcode.defaultOn` (`src/lib/admin/ekcode.ts`), lists only stores that have opened (`first_opened_at is not
  null`), and "stores offering it" is its own count, not read off the capped list (`speed-reviewer` with EXPLAIN).
- **Readers** (M4): Admin's Apps cell reads `a.on` and says "On (default)"; the console nav lists EkCode under Apps for
  every store; the turn-off action, when a `defaultOn` module has no row, writes one closed row with both timestamps
  `now()` and the same person, then audits `module.off` (M5).
- **Guard** (m8): a registry test allows `defaultOn` only on `billing: 'core'`, `status: 'now'` modules with no
  `outboxKinds`.
- **Before handover** (m10): a partner-built store can't turn EkCode off (CAN_MANAGE); harmless while it is unpublished.
- **What does not change:** EkCode's own switches stay above every store (Frrata's `ekcode_settings.sign_in`, a store's
  breaker, caps and pauses: `ekcode_shop_controls`, Admin's module pause). Checkout keeps EkCode as the first identity
  step, the guest fields below it (P3's frame keeps the same order). No shopper data moves without the shopper's own
  consent at that store (ADR-0009); a store having EkCode on shares nothing until a shopper chooses it.
- **Theme shops and code-site stores alike:** the checkout is Frrata's in both.

## Design review
- **UI/UX:** no new screen. Apps › EkCode reads On for a store that never touched it; its Off confirm is today's. The
  checkout's sign-in step appears for every store by default.
- **Tenancy:** no new table; the switch rows stay the shop's own (`tenant_modules`, RLS as 0028). The rewritten definer
  keeps `search_path = ''`, is revoked from public, anon, authenticated, service_role, and stays staff-only. Proof: a
  `scripts/verify/tenancy.sql` block (the next free number) shows a store with no row reads On, one with a closed latest
  row reads Off, and Admin's list counts both correctly.
- **SSOT:** one rule, in `moduleAccess`; SQL mirrors it in one predicate used by the definer, with a parity test.
- **Performance:** the facts query changes from "open rows" to one grouped row per module (`bool_or`, index
  `tenant_modules_tenant`), still one read on the checkout path.
- **Security:** no new action or route; the turn-off action writes the closed row through the existing `asMember` path.
- **Unit economics** (unit-economics-reviewer, 2026-11-16): merchants NEUTRAL (EkCode is core, ₹0 to them); Frrata HURTS a
  little, bounded. A code costs ₹0.1150 ex GST (input credit claimed); at 1 code an order a store costs ₹17.25 (Launch),
  ₹172.50 (Growth), ₹575 (Scale) a month, 0.5–1.2% of Frrata's revenue from it; the per-store daily caps bound the worst
  month. The platform-wide `globalHour` (2,000) would bind from a few hundred stores even on an ordinary day, so E5
  watches it and raises it ahead; a store at its cap loses EkCode for the day (guest checkout still works).
- **Blast radius:** every reader of module access (checkout's `moduleArm`, Apps, Admin, the EkCode gate); a module
  that is not `defaultOn` reads exactly as today (a test per path).

## Tasks
| # | Task | Verify |
|---|---|---|
| E1 | Registry `defaultOn`; `ModuleFacts.touched` (any row) beside `switchedOn` (an open row), folded by `switchFacts`; `moduleAccess` rule; tests: no row → on (default), closed latest → off, open → on, not-default modules unchanged | `npx vitest run src/domains/modules` |
| E2 | `readFactsIn` and Admin read one `bool_or(disabled_at is null)` row per module; the turn-off action writes a closed row when none is open | `npx vitest run src/lib`; `npm run typecheck` |
| E3 | Migration: `app_admin_ekcode_shops` on the same rule (grants re-run); Admin's Apps reader; proof block | `npm run verify:tenancy` |
| E4 | e2e `67-ekcode` starts from a store with no switch row (it offers EkCode), turns it off, on; the privacy page's paragraph; every flow that opens a checkout now draws EkCode (10, 69, 90, 95's budgets) | `npm run release:check`; the full `npm run e2e` |
| E4b | `PolicyFacts.offersEkcode` and the privacy paragraph (draft, marked for counsel); the console notice for rewritten privacy pages; the signup terms' line is deferred (precondition d: no merchant terms exist yet; counsel, with the owner) | `npx vitest run src/domains/policies`; `npm run check:api` |
| E5 | **Limits for default-on** (unit-economics review 2026-11-16): Admin › EkCode shows the busiest hour of the last 7 days against `globalHour` and warns at 80% (the rule: `globalHour` ≈ 3× the measured busiest hour, raised by a new limits version before it binds; Meta's 100K tier before ~400 stores); a sale-day raise is Admin's existing `raised_cap` per store, written into the EkCode runbook; the breaker is written down as not applying on Launch (its daily cap of 100 stops codes before `breakerAfter` 200) | `npx vitest run src/domains/ekcode-core`; `npm run e2e -- --only ekcode` |
| E6 | Measure for four weeks: delivered codes ÷ placed orders per store, sign-ins that end with no order, the busiest hour each week (from `ekcode_daily` and `app_admin_ekcode_shops`); the figures into `frata-unit-economics` | the dated lines |
| E7 | Reviews on the diff: `architecture-reviewer`, `tenancy-auditor` (the definer's revokes and grants), `speed-reviewer`, `api-contract-reviewer`, `words-reviewer`, `impact-reviewer` | the reports |

## Out of scope
Changing EkCode's limits or prices; any marketing from EkCode (ADR-0010 unchanged).
