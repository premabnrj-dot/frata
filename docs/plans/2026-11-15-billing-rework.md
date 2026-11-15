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
| Header: one tab row | the group's tabs (SettingsHead) above the billing tabs | Settings pages keep their group tabs (Neel § Settings) | no — to show |
| Month so far: "Not billed" figure | "Credited · came back or lost" | the not-billed list needs R2's index (architecture finding 6) | no — to show |
| Charges: "For" column; Download CSV; find by number; "Not billed" filter | descriptions carry the period; CSV, find and not-billed come with R2 | CSV needs the security review's route rules (M2, M3); not-billed needs the index | no — to show |
| Charges › Plan and apps: Price column | Period, Days, Amount | a stored line has no list price | no — to show |
| Invoices: financial year select | none | ≤ 36 invoices on one page | no — to show |
| Savings card wording "in October" | "on your last bill" | the card reads the last issued bill, whichever month | no — to show |
| Overview: "See as a table" link | a disclosure under the chart | no client script for a toggle | no — to show |
| Mockup copy changed by the words review (2026-11-15) | "Test payments" chip; "Pay this bill"; "See charges"; "Download PDF"; "How"; "Fee charged on"; "Most per debit"; "Not issued yet"; "Move to <plan>" for every plan move (one verb); "Keep <plan>" on every cancel; "Counted delivered after 30 days"; "We're updating…"; "This month's charge stays." | frata-design-language § Words rules 3, 4, 5, 8, 10, 11 (words-reviewer findings) | no — to show |
| Due banner "…was due on 5 Nov" with "Pay ₹X"; invoice status "Due 5 Nov" and "Paid · UPI Autopay"; Coming up "pay by 5 Dec" | the month and amount due; "Due ₹X"; "Paid" | the due date and the paying method are not stored on the invoice row; derive them in R2 with the not-billed work | no — to show |
| Invoices tab badge "1 due" | a count pill "1" | ViewTabs counts are numbers (Neel § Components) | no — to show |
| Next bill rows "Growth · December", "1% of ₹92,300 · November" | grouped rows "Plan", "Fee on delivered orders", then GST | the same grouping as Charges, so the two tabs agree; the line words are on Charges | no — to show |
| Last-bill line "October, Frrata cost you 3.7%" | "Your 1 Oct bill was 3.7% of delivered sales" | words review; a bill, not a calendar month, is what was charged | no — to show |
| Charges: IGST note "Karnataka to Maharashtra" | IGST 18% (or CGST + SGST) | the place of supply is on the PDF; the shop's State is on Details | no — to show |
| Charges › Plan and apps: apps that are off | only lines on the bill | an app that is off is not a charge; Plans › Apps on your bill lists them | no — to show |
| Scheduled change banner (grey) | Banner tone info | Banner has no neutral tone (Neel § Banners) | no — to show |
| Calculator default "Use my last 3 months" | "Use my sales" | the default is the last three bills' sales, fewer when there are fewer | no — to show |
| Upgrade dialog row "16 Nov – 30 Nov" | "Rest of this month" | the difference comes from planChangeAdds, which gives an amount, not its days | no — to show |
| Details: GSTIN "Checked" | "Checked" when the GSTIN's checksum passes, "(optional)" otherwise | a GSTIN can be empty | no — to show |

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

**architecture-reviewer (2026-11-15)** — 2 blockers (R2), 7 major, 5 minor; taken as follows.
- B1 = H2 above (system issuer migration, `p_system`, `'system'` audit kind, `issueWith` shared by Admin and auto;
  ADR-0007 amended; tenancy-auditor on the migration).
- B2: on the 1st–3rd IST draft `monthStartIST(now)` alone with its own budget; auto-issue only when the run reached and
  drafted every shop (`failed = 0 && skipped = 0`); a staff notice after the 3rd. The month issued on the 1st is
  `monthStartIST(now)` (this month's plan ahead + last month's fees) — finding 3.
- 4: count and total read inside the issuing transaction with `toIssue`'s rule; the spec says auto-issue replaces the
  human count check (owner decision 3).
- 5: the open bill's Charges come from the estimate's `Bill` (the same rolled-back run as Overview); stored rows only
  for issued bills.
- 6: the not-billed list needs `billableAtSql` with the draft's window and a `(tenant_id, shipped_at)` partial index
  (a migration) → moves to R2 with EXPLAIN; R1 shows billed orders and credits only.
- 7: one verdict — the calculator uses `deliveredFee` per plan for a figure the merchant picks; the Overview card stays
  `cheapestPlan` (issued bills). They answer different questions (your sales at a figure vs your last two bills).
- 8: history and payments read inside `billingOverview`'s base transaction; each tab loads only its own reads.
- 9: delivered sales = billed fee bases less credited bases, defined once in `charges.ts`.
- 11–14 taken: no yearly test in R1; no gate edit for the CSV route; the `over` line never shown; line kinds mapped once.

**Decision (2026-11-15):** R1 ships first without the CSV route (Download CSV lands with R2's review fixes); R2 waits
for its migration to pass `verify:tenancy`.

## Practices recorded in skills
- frata-design-language § Billing (Neel): tabs, the summary that reconciles, every chart with its table.

## Repetitive work → agents and scripts
None new.
