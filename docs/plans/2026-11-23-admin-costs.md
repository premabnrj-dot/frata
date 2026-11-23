# Admin › Costs — build plan

**Mockup:** https://claude.ai/artifact/MEoxVFhu7EUHpfzbA8obvA
**Approved:** owner, 2026-11-23
**Review:** architecture-reviewer pending, 2026-11-23
**Review:** tenancy-auditor 9 findings fixed in the spec and task 3, 2026-11-23
**Review:** security-reviewer 8 findings fixed in the spec, one for the owner (a passkey on edits and old Undo), 2026-11-23
**Review:** speed-reviewer 4 findings fixed in the spec, 2026-11-23

Unit economics: not run, nothing a merchant pays or Frrata charges changes.

Status: draft · Spec: `docs/specs/2026-11-23-admin-costs.md` · Phases C1, C2

Goal and design are in the spec; this file is the order of work. The spec's tasks 1–6 are cut finer here, each with its verify command.

## Tasks

| # | Task | Verify |
|---|---|---|
| 1 | Engine tests, then `src/domains/admin/costs.ts`: due dates (month-end clamp, 29 Feb, quarterly, yearly), next due, overdue count, monthly equivalent, burn, IST month and FY | `npx vitest run src/domains/admin` |
| 2 | Schema `src/lib/db/schema-costs.ts`; `drizzle/0170_admin_costs.sql` (`--custom`): grants to `frata_admin` only, RLS, `definer_only` policy, CHECKs | `npm run db:generate` shows no drift; `npm run check:migrations` |
| 3 | `check:tenant` rule: a grant on either table to any role but `frata_admin` (or a privilege beyond the spec's lists), or a policy not `to frata_admin`, fails; the table names are fenced to `src/lib/admin/costs.ts` (and `today.ts` in C2). `tenancy.sql` block after § 101: no other role holds any privilege; exact `frata_admin` privileges; RLS on, one permissive policy each; `frata_app` and `frata_builder` get `insufficient_privilege`; a positive round trip as `frata_admin` (insert, read, duplicate payment is one row, delete item refused, delete payment works, each CHECK rejects a bad row); `admin_fx_rate_latest()` runs for `frata_admin` only | `npm run check:tenant`; `npm run verify:tenancy` on a throwaway Postgres |
| 4 | `src/lib/admin/costs.ts`: the shared due-set read, Overview's three plain statements, the keyset payments read, and writes (one transaction, `tx.*` only, rate read before it), each with its `auditStaff` row; `costs` joins `MASTER_ONLY_WORDS`; activity words | unit tests with the admin db fake; `npm run gates` |
| 5 | Actions `costs/actions.ts` (`requireStaff(ADMIN_ONLY)` first, the spec's input rules, `confirmedRecently` on amount edits and Undo of a payment older than 10 minutes, `ActionResult`); a support `StaffOk` is refused in every lib export | `npm run check:actions`; tests per action |
| 6 | Page and dialogs as drawn: Overview, All costs panel, Add, Mark paid, states, phone; nav item in the Money group | `npm run e2e` flow `costs` at phone and desktop; `mockup-parity-reviewer`, `design-system-reviewer`, `words-reviewer` |
| 7 | **C2** (after 0170 is live in production) Payments view, CSV export route (admin, Origin check, formula-safe cells), `cost_due` Today source (one item per due cost) and nav badge; a today test where the costs source throws | e2e; `npm test`; `npm run typecheck` |
| 8 | Skills updated with version bumps; production migration printed by `scripts/prod-migrate.mjs`, applied, row inserted; push to `main`; runtime errors checked after an hour and next day | `npm run check:skills`; `get_runtime_errors` |

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
| — | — | — | — |
