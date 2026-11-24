# Admin › Costs auto-fill from Vercel and Mux — build plan

**Mockup:** https://claude.ai/artifact/1tQ7VNtR4jKhSYhy5NWSAm § 8
**Approved:** owner, 2026-11-23 (screens and the recommended calls; Anthropic and Supabase skipped for now)
**Review:** words-reviewer 4 findings, 3 fixed and the tag kept as the spec words it; impact-reviewer 8 findings, 6 fixed and 2 left (a required `source` field, a hand-built facts type), 2026-11-24

Unit economics: not run, nothing a merchant pays or Frrata charges changes.

Status: active · Spec: `docs/specs/2026-11-23-costs-autofill.md` · Phase A1

Goal and design are in the spec. A1 gives a repeating dollar cost a vendor to fill its bill from; nothing is saved until Mark paid.

## Tasks

| # | Task | Verify |
|---|---|---|
| 1 | `cost_items.source` (CHECK: Vercel or Mux, repeating dollar costs only) in `drizzle/0179_costs_source.sql`; engine helpers `billMonthOf`, `monthMicros`, `monthEnded`; `vendorFigures` in `src/lib/admin/costs.ts` reads `infra_usage_daily` through `usageRows` | `npx vitest run src/domains/admin`; `costs.int.test.ts` |
| 2 | Edit details gains "Fills from"; Mark paid opens with the vendor's figure and its rupees estimate, tagged "From Vercel · Oct"; the figure is offered only for a month that has ended | `npm run e2e -- --only costs,neel-admin` |
| 3 | Release: apply 0179 to production with its drizzle row; push to `main` | `npm test`; `get_runtime_errors` |

A2 (recording per vendor, `cost_payments.estimated`, "Confirm rupees") waits for the owner's word after A1 has run for a month: recording turns on only after one bill was matched.

## Deviations

| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| Connections list with "Record … for me" switches | Not in A1 | They belong to A2 | Told in the build report, 2026-11-24 |
| An Auto or Manual tag on every cost row | The "From Vercel · Oct" tag on a due row and in Mark paid | A1 only fills a due bill | Told in the build report, 2026-11-24 |
