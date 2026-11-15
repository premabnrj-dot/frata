# Plan: billing rework R1–R2 (page on Neel, issue on the 1st)
Spec: `docs/specs/2026-11-15-billing-rework.md` · Mockup: `docs/mockups/2026-11-15-billing-rework/` · Status: in progress

## Regression net first
- Existing: `src/domains/billing/__tests__/*` (bill, ladder), `src/lib/billing/__tests__/collect.int.test.ts`, the
  billing e2e flows in `e2e/flows/` that reach Settings › Plan and billing. Run before and after.
- New unit tests: `src/domains/billing/__tests__/charges.test.ts` (summary rows add up to the invoice total; cost share;
  plan totals at a sales figure match `deliveredFee` rounding; cheapest plan; yearly price is 10 × monthly).

## Tasks
| # | Task | Verify |
|---|---|---|
| R1·1 | `src/domains/billing/charges.ts`: summary rows from lines, cost share, plan cost at a sales figure, cheapest | `npx vitest run src/domains/billing` |
| R1·2 | Queries: `billCharges(m, invoiceId \| 'open')` (lines, fee rows paged, credits, not billed), `costHistory(m)` (six months), `paymentHistory(m)`; CSV route `settings/billing/charges.csv` | `npm run typecheck`; `check:billing-read` |
| R1·3 | Page: tabs in the address; Overview, Charges, Plans, Invoices, Payment, Details as drawn, Neel primitives only | `npm test`; `npm run typecheck`; e2e billing flows |
| R1·4 | Remove "orders included" from `src/app/page.tsx`, `src/app/start/page.tsx`, the billing page | grep shows Admin only |
| R2·1 | `issueMonthAuto(month)`: on the 1st–3rd IST, when Frrata's seller is real, issue last month's ready drafts with the drafted count and total; audited as `system` | `npx vitest run src/lib/billing` |
| R2·2 | Outbox cron calls it after drafts and before collection | `npm run typecheck` |

## Deviations (mockup element · built · reason · owner seen)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| Yearly segment and Pay yearly | hidden until R3 | needs a prepaid period in the bill engine | yes (phases, 2026-11-15) |
| Download all (ZIP), Email to my CA | hidden until R4 | needs SES and a ZIP route | yes |
| Copy to your CA field | hidden until R4 | needs a column | yes |
| Console rail | the real app shell | the mockup draws a stand-in | n/a |

## Review findings
**security-reviewer (2026-11-15)** — H1, H2 block R2; M2, M3 block the CSV route.
- H1: auto-issue skips whenever `frrataSeller().test`; never reads `testIssueAllowed`; `testIssueAllowed()` is false on
  `VERCEL_ENV=production`; GSTIN format, state code and SAC checked before anything is issued.
- H2: `issueMonthAuto` lives in `src/lib/admin/billing.ts`; a migration lets the issue definer take a null staff as an
  explicit system run, adds `'system'` to `audit_events_kind` (no user id, no email), repeats the revokes; `check:tenant`
  allows the cron route that one export.
- M1: 1st–3rd IST only, last month's IST period; count and total read from the drafts in the same run; only after
  `runDrafts` reached every shop; a refusal logs `errName` and leaves an Admin notice.
- M2: CSV route — `requireMember(CAN_MANAGE)` + `mayReadMoney`; tenant from the membership; `id` is a uuid or `open`,
  ≤ 40 chars; read under `withTenant` and filtered by tenant and id; one 404 for missing and foreign.
- M3: `open` runs the rolled-back draft — rate-limited per user and shop, fail closed; `lock_timeout 1s`, busy → 409;
  rows capped at 20,000; `maxDuration = 30`.
- L1–L3: CSV headers (`text/csv`, attachment, `private, no-store`, `nosniff`); formula-injection guard; no PII; cron
  calls auto-issue after drafts and before collection in its own try/catch.

**Decision (2026-11-15):** R1 ships first without the CSV route (Download CSV lands with R2's review fixes); R2 waits
for its migration to pass `verify:tenancy`.

## Practices recorded in skills
- frata-design-language § Billing (Neel): tabs, the summary that reconciles, every chart with its table.

## Repetitive work → agents and scripts
None new.
