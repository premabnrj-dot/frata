# EkCode on by default
Status: active (owner, 2026-11-16: "can we keep ekcode default order processing setup and by default it should remain
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

## Design
- **The default is data in one place:** the registry gains `defaultOn: true` for `ekcode` (`src/domains/modules/registry.ts`).
  `moduleAccess` reads a module as **on** when it has an open switch row, **or** when it is `defaultOn` and the store's
  latest switch row is not a closed one (the store never turned it off). Nothing new is stored; "enabled" stays derived
  (modules-foundation § 2).
- **A store's choice stands.** A store that turned EkCode off before stays off. Turning it off when it has no row writes
  one closed row (enabled and disabled at the same moment, by the same person), so the default never comes back on its
  own; turning it on again writes an open row, as today.
- **Every reader asks the same question:** the facts query gains `switchedOff` (modules whose latest row is closed);
  `app_admin_ekcode_shops` (Admin › EkCode, drizzle/0088) and Admin's per-shop Apps read the same rule (a migration
  replaces the definer, grants re-run).
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
- **Performance:** the facts query changes from "open rows" to "latest row per module" (`distinct on`, index
  `tenant_modules_tenant`), still one read on the checkout path.
- **Security:** no new action or route; the turn-off action writes the closed row through the existing `asMember` path.
- **Unit economics:** Frrata pays Meta for each EkCode sign-in code; default-on multiplies code volume across stores.
  The per-store caps and the breaker already bound it; `unit-economics-reviewer` checks the caps against the volume.
- **Blast radius:** every reader of module access (checkout's `moduleArm`, Apps, Admin, the EkCode gate); a module
  that is not `defaultOn` reads exactly as today (a test per path).

## Tasks
| # | Task | Verify |
|---|---|---|
| E1 | Registry `defaultOn`; `ModuleFacts.switchedOff`; `moduleAccess` rule; tests: no row → on (default), closed latest → off, open → on, not-default modules unchanged | `npx vitest run src/domains/modules` |
| E2 | `readFactsIn` reads the latest row per module; the turn-off action writes a closed row when none is open | `npx vitest run src/lib`; `npm run typecheck` |
| E3 | Migration: `app_admin_ekcode_shops` on the same rule (grants re-run); Admin's Apps reader; proof block | `npm run verify:tenancy` |
| E4 | e2e `67-ekcode`: a store that never switched EkCode on offers it at checkout; turned off, it doesn't; on again, it does | `npm run e2e -- --only ekcode,checkout` |
| E5 | Reviews on the diff: `architecture-reviewer`, `tenancy-auditor`, `unit-economics-reviewer`, `impact-reviewer` | the reports |

## Out of scope
Changing EkCode's limits or prices; any marketing from EkCode (ADR-0010 unchanged).
