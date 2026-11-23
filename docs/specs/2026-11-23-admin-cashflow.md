# Admin › Cashflow — cash in the bank, money in, money out, and the next six months
Status: draft · Date: 2026-11-23 · Mockup: https://claude.ai/artifact/1tQ7VNtR4jKhSYhy5NWSAm (`docs/mockups/2026-11-23-admin-cashflow.html`) · Approved: pending, owner

## In short
One Admin page, **Cashflow**, in the Money group beside Costs. Four figures answer the questions a founder asks:
how much is in the bank, how long it lasts, what we make or lose a month, and the floor we want to stay above.
Money in is read from Billing. Money out is read from Costs. Everything else is one typed entry. The balance is typed
with its date. The forecast is worked out from those, never typed.

## Goal
Like Costs, this moves none of the seven ranked problems directly (`frata-planning` § North star); it is an
operational module the owner asked for (2026-11-23). It earns its place by turning the Costs burn and Billing income
into one decision figure. Measure: the "cash lasts until" month agrees with a hand sum of the bank balance, the
next months' Costs due dates and the billing run-rate (a unit test holds it), and the books' own balance agrees with the
bank's within the difference the page shows.

## Job
The owner opens one page and knows: cash now, the month it runs out at this pace, the month it falls below the floor,
and what changed since last month.

## Research (products from memory, not re-read in the last 12 months: unverified)
Float and Fathom (cash forecast): **Taken:** opening cash, in, out, closing, by month. **Skip:** scenarios, several companies.
Mercury and Brex (runway): **Taken:** one runway line with a date. **Skip:** card controls. Zoho Books (reconcile):
**Taken:** a typed balance against the books and the difference. **Skip:** bank feeds, matching. Razorpay dashboard:
**Taken:** money in by day with its source. **Skip:** payouts (Frrata makes none: CLAUDE.md, shopper money goes to the shop).

## Design
Mockup: `docs/mockups/2026-11-23-admin-cashflow.html` (Overview, Movements, Add entry, Update balance, Accounts, states, phone).

### The data (platform scope, frata_admin only, the shape of 0093 and Costs 0172; no tenant)
- `cash_accounts` — `id`, `name` (1–60), `closed_on date null`, `created_at`. Insert, update, select.
- `cash_balances` — `id`, `account_id` (FK, restrict), `as_of date`, `balance_paise bigint` (between −1e11 and 1e11: an
  overdraft is real), `note` (≤ 300), `created_at`. Append-only: select, insert, delete (Undo). The latest by
  `(as_of, created_at)` is the account's balance.
- `cash_entries` — what Billing and Costs do not hold. `id`, `direction` in|out, `kind` (in: funding, loan, grant,
  owner_capital, other_in; out: gst_paid, tds_paid, tax_paid, loan_repayment, owner_draw, other_out; one exported tuple,
  direction and kind CHECKed together), `amount_paise bigint` (1 to 1e11), `status` done|planned, `happened_on date`
  (done) or `expected_on date` (planned; CHECK `(status = 'done') = (happened_on is not null)`), `account_id null`,
  `note` (≤ 300), `created_at`. Select, insert, update (a planned entry becomes done), delete.
- `cash_settings` — one row (`id smallint primary key check (id = 1)`), `floor_paise`, `updated_at`. Select, insert, update.
Grants, RLS and one permissive `frata_admin` policy per table, in the migration that creates them; `check:tenant` § 10's
pattern is extended to these four names and `tenancy.sql` proves it, as for Costs (re-audit rules 2–5 apply).
Reads of Billing use what `frata_admin` already holds (select on `frrata_payments`, `frrata_invoices`); partner credit
purchases have no Admin grant, so they join in R3 through an aggregate-only definer.

### What is derived, never stored (SSOT)
All in one pure engine, `src/domains/admin/cash.ts` (`now`/`today` are arguments; days are IST strings, as in Costs).

| Fact | Derived from |
|---|---|
| Money in, a month | Captured billing payments (not a test invoice) less refunds, by `captured_at`'s IST month; plus done in-entries |
| Money out, a month | Costs payments' rupees by `paid_on`; plus done out-entries |
| Cash in bank | The latest balance of each open account, summed; the date shown is the oldest of those |
| The books' figure at a date | Cash in bank at its date, plus money in less money out in between (billing and costs carry no account, so this is a total, not per account) |
| Difference | A typed total less the books' figure |
| Billing run-rate | The average of the last three full months of billing money in (fewer if fewer exist) |
| Costs in a month | The Costs engine's due dates for every live repeating cost (`dueDates`), dollars at the latest typed rate; a dollar cost with no rate is counted and named, never summed as 0 |
| GST to pay, a month (estimate) | 18/118 of the previous month's billing money in; `gst_paid` entries are what was paid |
| Opening | Cash in bank less the costs still due before this month ends |
| Closing | Opening + billing run-rate + planned in-entries − costs − GST to pay − planned out-entries |
| Cash lasts until | The first month a closing figure is below zero, extending the last month's net up to 36 months; "Beyond 3 years" otherwise |
| Below the floor | The first forecast month whose closing figure is under `floor_paise` |

### The screen — `/admin/cashflow`
Three tabs. **Overview**: the floor band when a month falls below it; four figures (cash in bank with its date, cash
lasts until, net each month as the average of the last three full months, the floor); last six months of money in and
out; next six months of closing cash with the floor drawn and the table behind it; "How this is worked out" as chips.
**Movements**: a month and an In, Out or Entered filter, three figures, then every line from its source (Billing as one
line per day, Costs per payment, Entered rows with Edit). **Accounts**: each account's balance and earlier balances.
Actions: **Update balance** (primary; shows the books' figure and the difference), **Add entry** (In or Out, Planned or done).
Every state is drawn: empty ("Add your cash in the bank"), loading, error, no permission, phone. A master admin only.

### Who may
Master admin (`ADMIN_ONLY`), checked on the page, in every action and inside every `src/lib/admin/cash.ts` export, as Costs.
Writes are audited in their own transaction (`cash.balance.set`, `.undo`, `cash.entry.add`, `.edit`, `.delete`,
`cash.account.add`, `.close`, `cash.floor.set`), `target` the row id, never a name or a note; `cash` joins `MASTER_ONLY_WORDS`.
Changing a balance by more than the books' difference needs no passkey (it is a typed observation, not a payment), but
deleting a balance older than ten minutes and editing a done entry need `confirmedRecently`.

### Reminders (R2)
A `TODAY_SOURCES` entry `cash_low` (area `cash`, master admin): one item when a forecast month falls below the floor,
"Cash falls below ₹2,50,000 in Jan 2027", action "See forecast"; it reads the engine through a `src/lib/admin/cash.ts`
export and never the tables (the fence in `check:tenant` § 10). It ships after the tables are live in production.

## Design review (answers; the agents run after sign-off)
- **UI/UX:** one primary per view (Update balance). The merchant's model, not our tables. Draft states, undo on every balance.
- **Tenancy:** platform scope, no merchant data; the Costs fence and proof extended. **Modularity:** engine in `domains/admin`,
  reads and writes in `lib/admin`, actions and `input.ts` beside the page. **SSOT:** the table above; Billing and Costs are
  read, never copied. **YAGNI:** no bank feed, no scenarios, no several companies, no per-account roll-forward (back when
  billing or costs carry an account). **KISS:** four small tables, one engine, one page.
- **Performance:** Overview reads five plain statements in `Promise.all` (balances, entries, billing by month, costs by month,
  the Costs due set shared with the Costs page). Everything is a month grouping on an indexed column; the forecast is arithmetic.
- **Security:** Zod caps on every input (amount 1 to ₹100 crore, text, days between 2020 and today + 2 years for a planned
  entry), exact money parsing, `csvCell` if an export is ever added; free text shown only as text.
- **Reliability:** no outbound calls. A failed read says "We couldn't read cashflow", never a zero. A source missing a
  rate says so.
- **Unit economics:** reads income and spend; changes no price or fee. `unit-economics-reviewer` checks it feeds
  `frata-unit-economics` without a second copy.
- **Stress test:** written against the real code after sign-off.

## Phases (each usable alone)
| Phase | Ships |
|---|---|
| **R1** | The four tables, the engine, Accounts, Update balance, Add entry, Movements, and Overview's figures and six months behind |
| **R2** | The forecast, runway, the floor, the floor band and the Today item |
| **R3** | Partner credit purchases as money in (an aggregate definer), GST from issued invoices in place of the estimate |

## Out of scope, with the signal that brings it back
Bank feeds (two typed balances disagree with the bank twice), scenarios (a decision needs "what if"), several companies
(a second entity exists), per-account roll-forward (billing or costs carry an account), payouts (Frrata starts to make any).

## Facts used
Billing's tables and columns: `src/lib/db/schema-billing.ts` (read 2026-11-23). GST 18% on Frrata's own services as billed on
its invoices. No third-party fact is used; the estimate's rule is the owner's call 3 and is for the CA to confirm.
