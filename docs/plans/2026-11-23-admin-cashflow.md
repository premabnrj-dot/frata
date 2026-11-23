# Admin › Cashflow — build plan

**Mockup:** https://claude.ai/artifact/1tQ7VNtR4jKhSYhy5NWSAm
**Approved:** owner, 2026-11-23
**Review:** architecture-reviewer pending, 2026-11-23
**Review:** tenancy-auditor pending, 2026-11-23
**Review:** security-reviewer pending, 2026-11-23
**Review:** speed-reviewer pending, 2026-11-23

Unit economics: not run, nothing a merchant pays or Frrata charges changes; Cashflow reads income and spend.

Status: draft · Spec: `docs/specs/2026-11-23-admin-cashflow.md` · Phases R1, R2 (R3 waits) · The Vercel and Mux prefill of
`docs/specs/2026-11-23-costs-autofill.md` (A1, A2) follows R1; Anthropic and Supabase are deferred by the owner.

## How it joins Costs
Costs is unchanged as a module. Cashflow **reads** it through exports of `src/lib/admin/costs.ts` (the check:tenant § 10 fence
keeps every other file off the cost tables): money out by month (`costOutByMonth`) and the shared due set (`costsData`, already
cached per request). A payment marked paid in Costs is money out in Cashflow at once; nothing is entered twice. Billing is read
through a new export in `src/lib/admin/billing.ts` (`billingInByMonth`). Cashflow's rows link back to the Cost or the invoice.

## Tasks (R1, then R2)
Regression net first; every task ends with its tests and `impact-reviewer` on its diff.

| # | Task | Verify |
|---|---|---|
| 1 | Engine tests, then `src/domains/admin/cash.ts`: month series, cash in bank (latest balance per open account), the books' figure and the difference, helper reuse of `monthKey`/`monthRange` | `npx vitest run src/domains/admin` |
| 2 | Schema `src/lib/db/schema-cash.ts` (accounts, balances, entries, settings, CHECKs, indexes); `npm run db:generate`; the access SQL appended to the generated file (grants, RLS, one permissive policy each); `check:tenant` § 10 generalised to the Costs and Cash tables (one list, one rule); `tenancy.sql` section after § 102 | `npm run db:generate` no drift after; `npm run verify:tenancy`; `npm run check:tenant` |
| 3 | Admin reads and writes: `lib/admin/cash.ts` (each export re-checks `ADMIN_ONLY`; one transaction per write with `tx.*` and `auditStaff(tx)`); `billingInByMonth` in `billing.ts`; `costOutByMonth` in `costs.ts` | `*.int.test.ts` against a real Postgres; `npm run gates` |
| 4 | Actions and `input.ts` (Zod caps, exact money through `parseAmount`, cleaned text; `confirmedRecently` on deleting an old balance and editing a done entry) | `npm run check:actions`; tests per parser |
| 5 | Page as drawn: Overview (figures and the six months behind), Movements, Accounts, Add entry, Update balance, states, phone; nav item `Cashflow` in the Money group (master admin only); the cash icon | `npm run e2e -- --only cashflow,costs,neel-admin`; `mockup-parity-reviewer`, `design-system-reviewer`, `words-reviewer` |
| 6 | **R2** the forecast (`forecast()` in the engine, tested against the hand sum), runway and the floor, the floor band, `cash_low` Today source and its nav count, shipped only after the tables are live | engine tests; e2e; `npm test`; `npm run typecheck` |
| 7 | Release: merge `main`, renumber the migration if it collides, `release:check`, `verify:tenancy`; print the production SQL and its drizzle row; **apply and push only on the owner's word for this migration** | `release-agent` |
| 8 | Skills updated with version bumps; production errors checked after an hour and the next day | `npm run check:skills`; `get_runtime_errors` |

## Practices recorded in skills
- `frata-architecture`: a Cashflow line under Admin (platform scope, reads Billing and Costs through exports, never their tables).
- `frata-design-language` § Admin › Cashflow: the approved rules (three tabs, one primary Update balance, the floor band, Planned entries).

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Granting and proving a platform-scope Admin table | `check:tenant` § 10 as one table list (Costs and Cash) and one proof helper |

## Deviations
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| — | — | — | — |
