# Admin › Cashflow — cash in the bank, money in, money out, and the next six months
Status: active · Date: 2026-11-23 · Mockup: https://claude.ai/artifact/1tQ7VNtR4jKhSYhy5NWSAm (`docs/mockups/2026-11-23-admin-cashflow.html`) · Approved: owner, 2026-11-23 (screens and the recommended calls; Anthropic and Supabase auto-fill skipped for now). Reviews folded in 2026-11-23 (architecture, tenancy, security, speed).

## In short
One Admin page, **Cashflow**, in the Money group beside Costs. Four figures: cash in the bank, the month cash runs out, what we make or lose a
month, and the floor we want to stay above. Money in is read from Billing. Money out is read from Costs. Everything else is one typed
entry. The balance is typed with its date. The forecast is worked out from those, never typed.

## Goal
Like Costs, this moves none of the seven ranked problems directly (`frata-planning` § North star); it is an operational module the owner
asked for (2026-11-23). It earns its place by turning the Costs burn and Billing income into one decision figure. Measure: "cash lasts
until" agrees with a hand sum of the bank balance, the months' Costs due dates and the billing run-rate (a unit test holds it).

## Job
The owner opens one page and knows: cash now, the month it runs out at this pace, the month it falls below the floor, what changed.

## Research (products from memory, not re-read in the last 12 months: unverified)
Float and Fathom: **Taken:** opening, in, out, closing by month. **Skip:** scenarios. Mercury and Brex: **Taken:** one runway line with a date.
Zoho Books: **Taken:** a typed balance against the books and the difference. **Skip:** bank feeds. Razorpay dashboard: **Taken:** money in
by day with its source. **Skip:** payouts (Frrata makes none).

## Design
### The data (platform scope, frata_admin only, the shape of Costs' 0172; no tenant)
- `cash_accounts` — `id`, `name` (1–60), `created_at`. Select, insert, update. (No close action until one is drawn.)
- `cash_balances` — `id`, `account_id` (FK restrict), `as_of date` (never after today, IST: the writer and a CHECK against 2100), `balance_paise bigint`
  (−1e11 to 1e11: an overdraft is real), `note` (≤ 300), `created_at`. Append-only: select, insert, delete (Undo). The latest is by
  `(as_of, created_at, id)`; index `(account_id, as_of, created_at, id)`.
- `cash_entries` — what Billing and Costs do not hold. `id`, `kind` (one exported tuple `CASH_KINDS`; direction is **derived** from the
  `KIND_DIRECTION` map beside it, never stored: in = funding, loan, grant, owner_capital, other_in; out = gst_paid, tds_paid, tax_paid,
  loan_repayment, owner_draw, other_out), `amount_paise` (1 to 1e11), `happened_on date null`, `expected_on date null` with
  `check ((happened_on is not null and expected_on is null) or (happened_on is null and expected_on is not null))`: a **planned** entry is one
  with no `happened_on`, so no status column. `account_id null` (FK restrict), `note` (≤ 300), `created_at`. Select, insert, update, delete.
  Indexes `(happened_on)` and a partial `(expected_on) where happened_on is null`.
- `cash_settings` — one row seeded by the migration (`id smallint primary key check (id = 1)`): `floor_paise null` (0 to 1e11), `main_account_id uuid null`
  (FK restrict), `updated_at`. Select, update.
- Billing indexes, in the same migration (speed review): `frrata_payments (captured_at) where captured_at is not null`, `frrata_payments (refunded_at) where
  refunded_at is not null`, `frrata_invoices (tenant_id, id) where test_mode`.
Grants, RLS and one permissive `frata_admin` policy per table in the migration; `check:tenant` § 10 becomes a **table-family map** (Costs tables: `schema-costs.ts`
and `costs.ts`; Cash tables: `schema-cash.ts` and `cash.ts`; a file naming another family's table fails, so `cash.ts` reads Costs only through its exports); `schema-cash`
is never re-exported from `schema.ts`. The gate and `tenancy.sql` also fail, for **both** families, a rule or trigger on a table, a function whose body depends on one
(`pg_depend`, including `begin atomic`), a publication that holds one, and `create rule`, `create trigger on`, `alter publication … add table` naming one.
`activity` words: `MASTER_ONLY_WORDS` already holds `billing`, `costs`, `credits`; `cash` joins it (and its Activity kind) with the Cash tables.

### What is derived, never stored (SSOT)
One pure engine, `src/domains/admin/cash.ts`; `today` is an argument; days are IST strings, as in Costs. One function, `monthRow(month)`, makes **every** month's row
(actual or forecast) so no formula is written twice; the runway, the floor, the Today item and the table all read the same 36-month series.

| Fact | Derived from |
|---|---|
| Money in, a past month | Captured billing payments of non-test invoices by `captured_at`'s IST month, **less refunds by `refunded_at`'s month**; plus done in-entries by `happened_on` |
| Money out, a past month | Costs payments' rupees by `paid_on`; plus done out-entries |
| Cash in bank | The latest balance of each account, summed |
| The books' figure | **The main account only** (`cash_settings.main_account_id`: where Billing and Costs land): its latest balance plus money in less money out after that balance's date, to the typed date. A balance typed for another account shows no books figure |
| Cash today | The main account's balance rolled forward to today (as above) plus the other accounts' latest balances |
| Opening of the forecast | Cash today, less unpaid costs due to the end of this month (overdue ones included), less this month's GST unless a `gst_paid` entry dated this month exists, ± planned entries to month end |
| Billing run-rate | The average of the last three full months of billing money in (fewer if fewer exist; none: 0 and the page says "No billing yet") |
| Costs, a forecast month | The Costs engine's `dueDates` for every live repeating cost, dollars at the latest typed rate (a dollar cost with no rate is counted and named, never summed as 0) |
| GST to pay, a forecast month | Next month: the **actual** GST on this month's issued invoices (Billing's GST rows). Later months: run-rate × `GST_BPS / (10000 + GST_BPS)` (`src/domains/billing/gst-rate.ts`), never a literal. Not modelled: input credit (`cost_payments.gst_paise`) and reverse charge (for the CA) |
| Closing | Opening + run-rate + planned in-entries − costs − GST − planned out-entries |
| Cash lasts until | The first of the 36 months whose closing is below zero; "Beyond 3 years" otherwise |
| Below the floor | The first month whose closing is under `floor_paise` |
| Difference | A typed main-account balance less the books' figure |

Money in is at **capture**: Razorpay settles later, net of its fee and GST, and `frrata_payments` has no fee column. So the Difference can include settlement lag and fees. Record Razorpay's fee as a
Cost (Payments & fees); the page names the lag only in the difference line. A dated Razorpay fact (`integration-researcher`) is a precondition of closing R1.

### The screen — `/admin/cashflow` (mockup)
**Overview**: the floor band, four figures, last six months in and out (a server-drawn SVG, no client chart), next six months of closing cash with the floor and the table behind it, "How this is
worked out". **Movements**: the month's lines from three sources (Billing one line a day, Costs per payment, entries with Edit), In, Out and Entered filters; the month is read whole with each source
capped (Costs 600, entries 500) and a row past the cap says there is more, merged in code, never keyset-paged across three sources. **Accounts**: each account's balance and earlier ones, the main
account tagged. Actions: **Update balance** (shows the books' figure and the Difference for the main account; the floor field is written only when changed, as its own audit row) and **Add entry**
(In or Out, "Not received yet" makes it Planned). Draft states: empty, loading, error, no permission, phone. Master admin only.

### Who may
`ADMIN_ONLY` on the page, in every action and inside every `src/lib/admin/cash.ts` export. Writes are audited in their own transaction (`cash.balance.set`, `.undo`, `cash.entry.add`, `.edit`, `.delete`,
`cash.account.add`, `cash.settings.set`), `target` the row id, never a name or a note. **Audit `detail` never holds a balance, a floor, or a main-account figure** (it is kept forever): balance rows carry
`{accountId, asOf}`; a done entry's edit or delete carries the old `{kind, amountPaise, happenedOn}` (a record that reaches the CA must survive); everything else carries changed field names only.
`confirmedRecently` is needed to **delete a balance older than `UNDO_FREE_MS`** (imported from Costs, never copied), to **edit or delete a done entry older than that**, or to make a planned entry
done with a different amount or date. A new balance, a new entry and the floor need none. Inputs: `as_of` and `happened_on` not after today (IST), `expected_on` not after today + 2 years,
amounts through a signed parser for balances (−1e11 to 1e11, "−" and "-") and `parseAmount` elsewhere; a closed or unknown account is refused; ids are checked as uuids and matched with their parent
(`delete … where id = $b and account_id = $a returning`, zero rows is not found). "Our books say" is a server read (`requireStaff` and the lib check, a reply of `{books, difference}` only, computed on the
server). Logs carry the tag and `errName(e)` only, never an amount, an account name or a note; account names and notes render only as text; an entry's "What" comes from the code tuple. No export is
planned; if one is added it copies Costs' route and also needs `confirmedRecently` and an audit row.

### Reads and speed
Billing is read through `billingInByMonth(staff, from, to)` in `src/lib/admin/billing.ts`: `adminOnly` first, `sum(amount)` and `sum(refund_amount)` only, grouped by `date_trunc('month', … at time zone 'Asia/Kolkata')`,
non-test through `not exists (… i.test_mode)`, never `utr`, a gateway id or `recorded_by`; bounds are **values** computed in code (`monthOfYM(monthKey(today, -6))` to the month after next), never an expression on the
column; one export with a day-or-month parameter (Movements reads days). Costs are read through exports of `costs.ts` (`costOutByMonth`, the shared `costsData`). One `cashInputs(today: string)` inside `cache()`
(keyed by `istDayKey`, never a `Date`) serves Overview and the Today item: one statement for the cash tables (latest balance per account, planned entries, settings), one Billing window for 7 months, and the
Costs set. No floor or no balance: the Today source returns before reading Billing. Admin's first-load JS: the dialogs load with `next/dynamic` and reuse Costs' `fields.tsx` pattern; `/admin/cashflow` ≤ 146 kB gz.

### Reminders (R2)
A `TODAY_SOURCES` entry `cash_low` after `cost_due` (area `cash`, master admin): one item when a month falls below the floor, "Cash falls below the floor in Jan 2027" (no balance or closing figure in its words), action "See
forecast". The lib export re-checks `ADMIN_ONLY`; support never sees it (tested). It ships after R1's tables are live in production.

## Design review (answers)
UI/UX, tenancy, modularity, SSOT, YAGNI, KISS: as above. **KISS:** four tables; `cash_settings` follows `trial_settings` (the existing one-row table) and holds the floor and the main account, which no other
table can. **Reliability:** no outbound calls; a failed read says "We couldn't read cashflow", never a zero. **Unit economics:** not run: nothing a merchant pays or Frrata charges changes.
**Stress test:** written against the real code after the first build task.

## Phases (each usable alone, each released on its own)
| Phase | Ships |
|---|---|
| **R1** | Tables, indexes, engine, Accounts, Update balance, Add entry, Movements, Overview's figures and the six months behind; released (migration applied, row inserted, pushed) before R2 |
| **R2** | `monthRow` forecast over 36 months, runway, the floor and its band, the Today item |
| **R3** | Partner credit purchases as money in (`admin_partner_cash_in`, month sums only, a definer revoked from everyone but `frata_admin`, `set search_path = ''`), GST from partner invoices |

## Out of scope, with the signal that brings it back
Bank feeds (two typed balances disagree with the bank twice), scenarios, several companies, per-account roll-forward beyond the main account (billing or costs carry an account), payouts, account closing, an export.

## Facts used
`src/lib/db/schema-billing.ts` columns and indexes (read 2026-11-23). Razorpay settlement timing and fees: a dated fact is still to be gathered (precondition of R1's close). GST 18% as Frrata bills it; the CA confirms the rule.
