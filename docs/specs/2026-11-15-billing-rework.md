# Billing rework: Plan and billing, rebuilt on Neel
Status: active · Date: 2026-11-15 · Mockup: https://claude.ai/artifact/Tp6T3A68mzNrYzVP8NhsxD (`docs/mockups/2026-11-15-billing-rework/`) · Approved: owner, 2026-11-15 ("go ahead", with a Charges page and Neel primitives)
Builds on: `docs/specs/2026-11-08-billing.md` (B0–B4, the engine; unchanged rules stay binding).

## Goal
North star (6) true profit per order: a merchant sees exactly what Frrata cost, per order, per plan and per app, and
what it cost as a share of delivered sales; and pays without friction. Measures (from the 2026-11-08 spec, kept):
invoices paid within 3 days of issue ≥ 95%; billing tickets < 2 per 100 merchants a month; autopay ≥ 80% by month 3.
New: share of plan changes made from the calculator (signal that the comparison helps).

## Job
A brand owner opens Plan and billing, knows in one look what the next bill is and how it is paid, can trace every rupee
of any bill to an order, a plan or an app, sees which plan costs least for their sales, and pays or sets autopay in
one action.

## Owner decisions (2026-11-15)
1. "Orders included" leaves every merchant-facing page (it never changed a bill). The column stays in plan versions
   (Admin keeps it; the over-plan count line on invoices is unchanged).
2. Yearly plans: yes, 2 months free (10 × the monthly price, paid ahead for 12 months). Fees stay monthly.
3. Bills are issued automatically on the 1st (no staff review step); Admin keeps "Issue all ready" for a re-run.
4. An upgrade's difference goes on the next bill (today's rule, kept).

## Research (summary)
- Stripe customer portal, Shopify billing (India), Vercel usage page (all current, 2026): one summary of the next
  charge, a usage breakdown per line that adds up to the invoice, invoices with PDF and status, the payment method with
  change. *Taken:* a summary that reconciles to a table; every line drills down to its rows; CSV export.
- Razorpay Recurring Payments and RBI e-mandate rules: as in the 2026-11-08 spec (unchanged; recheck before go-live).
- Codebase: every number the page needs already exists — `frrata_invoice_lines` (plan, add-on, fee, change, credit
  lines), `frrata_invoice_fees` (one row per billed order: base, rate, fee), `frrata_fee_credits`, `frrata_payments`
  (method, captured or failed, reason), the rolled-back draft estimate, `deliveredFee`, `cheapestPlan` (ladder.ts),
  `MODULES` and `addon_prices`. Nothing is stored twice.

## Design (mockup tabs; ViewTabs, the tab in the address `?tab=`)
- **Header**: Settings › Team and plan; title; Tag (plan · price + rate), Badge (autopay on/off), Badge "Test gateway"
  when the gateway key is a test key. A warn Banner when an issued bill is due, with Pay.
- **Overview**: Next bill (amount so far with GST, its date, the month's progress, its three lines, how it is paid,
  "See every charge", Turn on autopay); the month so far (delivered orders, delivered sales, fee so far, not billed);
  last month's cost as a share of delivered sales; "What Frrata cost each month" (six months from issued invoices plus
  the running month, plan and fee stacked, see-as-table); the cheaper-plan card (ladder.ts rule, unchanged floor);
  Coming up (notice, debit or due date, a scheduled plan change).
- **Charges**: pick a bill (the open one, then issued ones); a summary table that adds up to the bill (plan, apps, fee
  on delivered orders with count and base, not billed, before GST, CGST+SGST or IGST, total); By order (order, shipped,
  outcome, order total, fee base, rate, fee; filter billed / not billed; find by number; 50 at a time; CSV of all);
  Plan and apps (item, period, days, price, amount, total).
- **Plans**: Monthly / Yearly segmented; the calculator (delivered sales a month, default the shop's last three
  months' average; each plan's monthly cost, cheapest marked); the feature table from plan versions and add-on prices;
  actions (upgrade now, downgrade on the 1st, pay yearly); Apps on your bill.
- **Invoices**: filters (all, due, paid, credit notes), financial year, Pay, Charges, PDF; Download all (ZIP), Email to
  my CA.
- **Payment**: autopay (method, limit, next debit, notice; change, turn off with a confirm) or the three methods;
  payments with failures and their reason.
- **Details**: the billing details form (legal name, GSTIN checked, address, State with the tax it means, bills go to,
  copy to your CA).

## Phases
| Phase | Ships | Needs |
|---|---|---|
| **R1 Page** | every tab above except Yearly, ZIP, Email to my CA and Copy to your CA; "orders included" removed from merchant pages | nothing new in the database |
| **R2 Issue on the 1st** | the daily cron issues last month's drafts when Frrata's seller details are set | a system issuer in the definer's audit |
| **R3 Yearly** | Yearly segment and Pay yearly; a prepaid plan period; the monthly bill skips the plan line in a prepaid month | a table, a definer, a bill-engine rule; unit-economics review |
| **R4 CA and exports** | Copy to your CA (a column), ZIP of a year's PDFs, Email to my CA (SES) | SES live |
| **R5 Before real money** | webhook amount check; eNACH counted after confirmation; system definers on their own role; token events | Razorpay recurring enabled |

## Design review
- **UI/UX** — one primary action per tab (Pay or Turn on autopay; pick a bill; change plan; pay; save). States: no plan
  yet, trial, no invoices, test gateway, gateway not configured ("Not open yet" stays), busy estimate, support visit
  (read-only, no money actions), staff and partners refused (as today), phone (tables scroll in their box, tabs scroll).
  Feedback: toast after every action; dialogs name the money and the date (Rule 0 allows it).
- **Tenancy** — no new table in R1; every read through `src/lib/queries/billing.ts` with `withTenant` and `mayReadMoney`
  (owner, admin); the CSV route uses `requireMember` and the same query. `check:billing-read` keeps the one importer
  rule (the CSV route is added to its allowed list).
- **Modularity** — pure: `src/domains/billing/charges.ts` (summary rows from lines and fees; cost share; plan totals for
  a sales figure); reads: `billing.ts` queries; rendering: `settings/billing/_components/*`.
- **SSOT / DRY** — the fee is `deliveredFee`/the stored fee row; plan cost at a sales figure uses the same rate and
  rounding (`deliveredFee` on the figure); the summary is built from stored lines, never re-derived; GST from the
  invoice row. The estimate stays the rolled-back run.
- **YAGNI** — no outlier hold on auto-issue (owner: automatic); no PDFs zipped until R4; no new chart library (Neel rule).
- **KISS** — R1 adds no table and no migration.
- **Scalability / performance** — Overview: one `withTenant` with the existing parallel reads plus two small ones
  (six months of lines; last payments, limit 24); Charges: the bill's fee rows paged 50 by `(invoice_id)` index;
  not-billed orders by the month's window on `orders` (index on tenant and shipped/outcome timestamps — EXPLAIN in the
  plan). CSV streams the bill's rows (≤ a month of orders).
- **Reliability** — no new outbound call in R1; Pay and autopay keep B3's server-made orders and signature checks.
- **Security** — no new action that moves money in R1; the CSV route: owner/admin, tenant from the session, invoice id
  validated as a uuid and read under RLS, `content-disposition` attachment, no PII beyond order numbers and amounts.
- **Motion and visuals** — Neel tabs, dialog and toast patterns; the cost chart is hand-drawn SVG/CSS with its table.
- **Unit economics** — R1 changes nothing a merchant pays; R3 (yearly) cuts plan revenue by 2/12 for prepaying shops
  and is reviewed then.
- **Blast radius** — `src/app/(console)/console/settings/billing/**`, `src/lib/queries/billing.ts`, `src/app/page.tsx`
  and `src/app/start/page.tsx` (orders included), the outbox cron (R2).

## Out of scope
Outlier review before issue (signal: a wrong bill reported); partner statements (B5); paying several bills at once.

## Facts used
Razorpay Recurring and RBI e-mandate facts: `frata-integrations` § Merchant billing (checked 2026-11-08; recheck before
R5).
