# Admin › Costs — build plan

**Mockup:** https://claude.ai/artifact/MEoxVFhu7EUHpfzbA8obvA
**Approved:** owner, 2026-11-23
**Review:** architecture-reviewer 18 findings fixed in the spec and plan, 2026-11-23
**Review:** tenancy-auditor 9 findings fixed in the spec and task 3; re-audit of 0170 SAFE, 9 gate and proof findings fixed, 2026-11-23
**Review:** security-reviewer 8 findings fixed in the spec, one for the owner (a passkey on edits and old Undo), 2026-11-23
**Review:** speed-reviewer 4 findings fixed in the spec, 2026-11-23
**Review:** design-system-reviewer 5 findings fixed or in Deviations, 2026-11-23
**Review:** words-reviewer findings fixed except words the approved mockup drew (owner's call), 2026-11-23
**Review:** mockup-parity-reviewer 27 rows fixed or in Deviations, 2026-11-23
**Review:** impact-reviewer task 6 findings fixed, 2026-11-23

Unit economics: not run, nothing a merchant pays or Frrata charges changes.

Status: active · Spec: `docs/specs/2026-11-23-admin-costs.md` · Phases C1, C2

Goal and design are in the spec; this file is the order of work. The spec's tasks 1–6 are cut finer here, each with its verify command.

## Tasks

| # | Task | Verify |
|---|---|---|
| 1 | Move `addMonths` to `domains/time/month.ts`, add `fyOf`, both callers import them. Engine tests, then `src/domains/admin/costs.ts`: due dates (month-end clamp, 29 Feb, quarterly, yearly), next due, overdue count, monthly equivalent, burn, IST month and FY | `npx vitest run src/domains/admin` |
| 2 | Schema `src/lib/db/schema-costs.ts`; `npm run db:generate` writes `drizzle/0170` (tables, CHECKs, indexes, snapshot); append the access SQL (grants, RLS, `admin_costs` policy, `admin_fx_rate_latest()`) to that same file; commit with task 3 | `npm run db:generate` shows no drift after; `npm run check:migrations` |
| 3 | `check:tenant` rule: a grant on either table to any role but `frata_admin` (or a privilege beyond the spec's lists), or a policy not `to frata_admin`, fails; the table names are fenced to `src/lib/admin/costs.ts` (and `today.ts` in C2). `tenancy.sql` block after § 101: no other role holds any privilege; exact `frata_admin` privileges; RLS on, one permissive policy each; `frata_app` and `frata_builder` get `insufficient_privilege`; a positive round trip as `frata_admin` (insert, read, duplicate payment is one row, delete item refused, delete payment works, each CHECK rejects a bad row); `admin_fx_rate_latest()` runs for `frata_admin` only | `npm run check:tenant`; `npm run verify:tenancy` on a throwaway Postgres |
| 4 | `src/lib/admin/costs.ts`: the shared due-set read, Overview's three plain statements, the keyset payments read, and writes (one transaction, `tx.*` only, rate read before it), each with its `auditStaff` row; `costs` joins `MASTER_ONLY_WORDS`; activity words | `*.int.test.ts` against a real Postgres, like the other Admin tests; `npm run gates` |
| 5 | Actions `costs/actions.ts` (`requireStaff(ADMIN_ONLY)` first, the spec's input rules, `confirmedRecently` on amount edits and Undo of a payment older than 10 minutes, `ActionResult`); a support `StaffOk` is refused in every lib export | `npm run check:actions`; tests per action |
| 6 | Page and dialogs as drawn: Overview, All costs panel (`?id=`), Payments with CSV export (billing's export route copied), Add, Mark paid, states including no match, phone; `NeedsBand`, `form-dialog`, the cost icon in `ICONS`; nav item in the Money group | `npm run e2e -- --only costs,neel-admin` (the layout also reaches `ux` and `neel-shell`; `npm run release:check`); `mockup-parity-reviewer`, `design-system-reviewer`, `words-reviewer` |
| 7 | **C2** (after 0170 is live in production) `cost_due` Today source (one item per due cost) and nav badge; a today test where the costs source throws | e2e; `npm test`; `npm run typecheck` |
| 8 | Production migration printed by `scripts/prod-migrate.mjs`, applied and its row inserted **before C1's first push**; skills updated with version bumps; push to `main`; runtime errors checked after an hour and next day | `npm run check:skills`; `get_runtime_errors` |

Each task ends with `impact-reviewer` on its diff. Task 6 closes only after parity passes.

## Practices recorded in skills
- `frata-architecture`: Costs bullet under Admin. `frata-design-language`: Costs rules in `reference/admin-and-partner.md`. `frata-unit-economics`: burn read from Costs.

## Repetitive work → agents and scripts
| Chore | Becomes |
|---|---|
| Production SQL for 0170 | existing `scripts/prod-migrate.mjs` |

## Deviations

| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| Nav badge on Costs | Arrives with C2 | The badge reads the Today source, which ships after 0170 is live | Told in the plan review and the build report, 2026-11-23 |
| A scrim over the list behind the open cost | The shared quick look: no scrim, the list stays usable, it takes focus, Esc closes, ↑ ↓ move to the next cost | frata-design-language § Quick look; the keyboard path the scrim version lacks | Told in the build report, 2026-11-23 |
| No column header row on the tables | A header row on every table | The shared DataTable needs headers for screen readers | Told in the build report, 2026-11-23 |
| Add dialog drew no way to choose the currency (a fixed "USD" prefix) | The prefix is a small currency choice (INR, USD) | The mockup showed no control to switch it | Told in the build report, 2026-11-23 |
| The date field drawn with a calendar icon and the year ("26 Nov 2026") | The shared date field ("23 Nov") | A shared primitive | Told in the build report, 2026-11-23 |
| A loading skeleton | The shared top progress bar, no `loading.tsx` | frata-design-language § Console patterns (a loading file made search-param links commit nothing) | Told in the build report, 2026-11-23 |
| Phone bottom bar with a Money item | The shared bar (Today, Merchants, Partners, More); Costs is under More | The Admin shell is shared and its bar is not this plan's to change | Told in the build report, 2026-11-23 |
| "Overdue" in the list | "Overdue 3 days" | The mockup said both; the days are what a person acts on | Told in the build report, 2026-11-23 |
| Error words "Enter an amount above ₹0." | "Enter an amount above zero." | The field takes dollars as well as rupees | Told in the build report, 2026-11-23 |
| A cost icon on the empty state's tile | The payments pictogram | The pictogram set has no cost drawing | Told in the build report, 2026-11-23 |
