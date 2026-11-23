# Admin › Cashflow — build plan

**Mockup:** https://claude.ai/artifact/1tQ7VNtR4jKhSYhy5NWSAm
**Approved:** owner, 2026-11-23
**Review:** architecture-reviewer 19 findings fixed in the spec and plan (opening formula, main-account books figure, derived columns, task order), 2026-11-23
**Review:** tenancy-auditor 6 findings fixed (catalog checks for both families, entry date pairing, settings, tie order), 2026-11-23
**Review:** security-reviewer 10 findings fixed (audit detail holds no balance, passkey on done-entry changes, bounds), 2026-11-23
**Review:** speed-reviewer 4 findings fixed (Billing indexes, one cached read, value bounds, JS budget), 2026-11-23

Unit economics: not run, nothing a merchant pays or Frrata charges changes; Cashflow reads income and spend.

Status: active · Spec: `docs/specs/2026-11-23-admin-cashflow.md` · R1, then R2 (each released on its own); R3 waits · The Vercel and Mux prefill of
`docs/specs/2026-11-23-costs-autofill.md` (A1, A2) follows R1; Anthropic and Supabase are deferred by the owner.

## How it joins Costs
Costs is unchanged as a module. Cashflow **reads** it through exports of `src/lib/admin/costs.ts` (the table-family fence keeps every other file off the cost tables):
money out by month (`costOutByMonth`) and the shared due set (`costsData`, cached per request). A payment marked paid in Costs is money out in Cashflow at once; nothing is
entered twice. Billing is read through `billingInByMonth` in `src/lib/admin/billing.ts`. Cashflow's rows link back to the Cost or the invoice.

## Tasks
Regression net first; every task ends with its tests and `impact-reviewer` on its diff. Baseline before task 1: `npm run e2e -- --only costs,neel-admin` green.

| # | Task | Verify |
|---|---|---|
| 1 | **Harden the gate for both families** (also closes a gap in the shipped Costs tables): `check:tenant` § 10 as a table-family map (schema file and lib file per family); fail `create rule`, `create trigger … on`, `alter publication … add table`, `begin atomic`, and a function body naming a protected table; `tenancy.sql` § 102 gains the catalog checks (`pg_rewrite`, `pg_trigger`, `pg_depend` on `pg_proc`, `pg_publication_tables`) for the Costs tables | try each bad migration by hand and watch the gate fail; `npm run verify:tenancy`; `npm run check:tenant` |
| 2 | Engine tests, then `src/domains/admin/cash.ts`: `monthRow`, the 36-month series, run-rate (zero months, fewer than three), the books' figure for the main account, the opening (billing after the balance date, overdue dues, this month's GST, planned entries), runway, floor, rounding once, an account with no balance yet; `CASH_KINDS` and `KIND_DIRECTION`; the signed balance parser | `npx vitest run src/domains/admin` |
| 3 | Schema `src/lib/db/schema-cash.ts` (never re-exported from `schema.ts`); `npm run db:generate`; append the access SQL (grants, RLS, one policy each, the seeded settings row, the three Billing indexes) to that file; `cash` joins `MASTER_ONLY_WORDS` and the Activity words; `tenancy.sql` § 103 (exact ACLs, one policy each, bad rows refused, tie order, settings single row, no other role) | `npm run db:generate` no drift; `npm run verify:tenancy`; `npm run check:migrations`; a test ties the CHECK lists to the engine tuples |
| 4 | Reads and writes: `lib/admin/cash.ts` (each export re-checks `ADMIN_ONLY`; one transaction per write, `tx.*` and `auditStaff(tx)`; the audit detail rules in the spec); `billingInByMonth` in `billing.ts` (value bounds, `date_trunc`, `not exists` for test invoices, sums only); `costOutByMonth` in `costs.ts`; one cached `cashInputs(today)` | `*.int.test.ts` against a real Postgres (audit rows hold no balance; support refused in every export; closed account refused); `EXPLAIN` of the Billing read at a 10× seed under 100 ms |
| 5 | Actions and `input.ts` (Zod caps, signed balance parser, dates not after today, `confirmedRecently` on a balance or done entry older than `UNDO_FREE_MS`) | `npm run check:actions`; tests per parser |
| 6 | Page as drawn: Overview (figures and the six months behind as server SVG), Movements (month read whole, sources capped), Accounts, Add entry, Update balance (dynamic), states, phone; nav item in the Money group (master admin); the e2e flow `cashflow` is written here | `npm run e2e -- --only cashflow,costs,neel-admin`; `mockup-parity-reviewer`, `design-system-reviewer`, `words-reviewer`; `/admin/cashflow` ≤ 146 kB gz |
| 7 | A dated Razorpay settlement and fee fact (`integration-researcher`), recorded in `frata-integrations` | the skill's dated line |
| 8 | **Release R1**: merge `main`, renumber if it collides, `release:check`, `verify:tenancy`; print the production SQL and its drizzle row; apply it (the owner's go-ahead, 2026-11-23, covers this migration); **push to `main` only on the owner's word** | `release-agent`; `get_runtime_errors` |
| 9 | **R2**: the forecast, runway, floor and band, `cash_low` and the nav count (after the tables are live) | engine tests against the hand sum; e2e; `npm test`; `npm run typecheck` |
| 10 | Release R2; skills updated with version bumps; production errors checked after an hour and the next day | `release-agent`; `npm run check:skills` |

## Practices recorded in skills
- `frata-architecture`: a Cashflow line under Admin (platform scope, reads Billing and Costs through exports; the table-family fence; the catalog checks).
- `frata-design-language` § Admin › Cashflow: the approved rules (three tabs, one primary Update balance, the floor band, Planned entries, the main-account books figure).

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Granting and proving a platform-scope Admin table | `check:tenant` § 10 as one table-family map, and a proof block per family |

## Deviations
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| "Our books say" on the Reserve account's balance (it read "Matches") | No books line on a non-main account | Billing and Costs carry no account, so only the main account has a books figure | Told in the 2026-11-23 build report |
| A loading skeleton | The shared top progress bar, no `loading.tsx` | frata-design-language § Console patterns | Told in the 2026-11-23 build report |
| A phone bottom bar with a Money item | The shared bar; Cashflow is under More | The Admin shell is shared | Told in the 2026-11-23 build report |
| The nav count on Cashflow in R1 | It arrives with R2 | It reads the Today source, which ships after the tables are live | Told in the 2026-11-23 build report |
| "Keep at least" with a Change link on the Overview | The figure and "set it in Update balance" | The floor is one field in that dialog; a second entry point waits for R2 | Told in the build report, 2026-11-23 |
| Toast "Balance saved · ₹X in all" | "Balance saved." with Undo | A balance never goes in a message the audit trail or a log could keep | Told in the build report, 2026-11-23 |
| Remove, Mark paid, Mark received, Undo and a "None" account (not drawn) | Built as secondary or ghost buttons and menu items | The spec's flows need them; each has an aria-label naming its row | Told in the build report, 2026-11-23 |
| Update balance phone sheet with a single "Difference" row | "Our books say" and "Difference", plus one line that settlement lag and fees can explain it | frata-integrations: Razorpay pays out about two working days after capture, less its fee (checked 2026-11-23) | Told in the build report, 2026-11-23 |
