# Admin › Costs — what Frrata pays, recurring and one-time

Status: active · Date: 2026-11-23 · Mockup: https://claude.ai/artifact/MEoxVFhu7EUHpfzbA8obvA (`docs/mockups/2026-11-23-admin-costs.html`) · Approved: owner, 2026-11-23 (screens and the five calls as recommended)


## In short

One new Admin page, **Costs**, in the Money group beside Plans and Billing. It answers four questions:
what do we pay, what falls due next, what did this month cost, and what is our monthly burn.
Two tables, one pure engine, one page with three views. No integrations, no outbound messages.
Reminders ride on Admin › Today (the badge you already read).

## Goal

This moves none of the seven ranked problems directly (`frata-planning` § North star), so it is an
**operational exception the owner asked for**. It earns its place in one way: the monthly burn it gives
is the cost side of `frata-unit-economics` (break-even tenants, funding need), which today are
estimates typed into docs. Measure: every recurring cost Frrata pays is listed with its next due date,
and the burn figure matches the bank statement for a month within ₹1.

## Job

The owner (and any Admin-role staff) records every cost once, is told before a renewal falls due, and
can hand the CA a clean list at year end.

## The cost types, as the owner described them

| Type | Example | How it is stored | What the screen asks |
|---|---|---|---|
| Recurring, fixed | Domain (yearly), Google Workspace, Supabase Pro | item with a cadence and an amount | name, amount, repeats, next due |
| Recurring, varies | Vercel overage, WhatsApp conversations, Anthropic usage | same item, **amount varies** on; the amount is the estimate | "Mark paid" asks for the actual bill |
| One-time | Logo, legal registration, a laptop, a one-off audit | item kind one-time with one payment | name, amount, paid on |
| Ended | A cancelled tool | item with `ends_on` | kept for history, drops out of burn and due |

Cadences: monthly, quarterly, yearly. Currencies: INR and USD (the vendors we pay in). Nothing else until
a cost arrives that needs it.

## Design

### The data (platform scope, no tenant)

Two tables, migration `0170_admin_costs.sql`, in the shape of `infra_usage_daily` (drizzle/0093), **not** the P2
`definer_only` pattern (which would lock `frata_admin` out too; tenancy review 2026-11-23):

```
revoke all on cost_items, cost_payments from public, anon, authenticated, service_role, frata_app, frata_builder;
alter table cost_items enable row level security;  alter table cost_payments enable row level security;
grant select, insert, update on cost_items to frata_admin;     -- no delete: an item is ended, never removed
grant select, insert, delete on cost_payments to frata_admin;  -- delete is Undo
create policy admin_costs on cost_items    for all to frata_admin using (true) with check (true);
create policy admin_costs on cost_payments for all to frata_admin using (true) with check (true);
```

The database cannot tell a master admin from support staff (one connection), so every exported function in
`src/lib/admin/costs.ts` checks `ADMIN_ONLY` on the `StaffOk` itself, as `setFxRate` does.

`cost_items` — the thing we pay for
- `id`, `name` (1–80), `vendor` (≤ 80, optional), `category` (text + CHECK + exported tuple `COST_CATEGORIES`: infrastructure, ai, messaging, software, marketing, legal, people, design, other)
- `kind` `recurring | one_time`, `cadence` `monthly | quarterly | yearly` (null for one-time; CHECK pairs them)
- `amount_minor bigint` (paise or cents), `currency` `INR | USD`, `varies boolean`
- `anchor_on date` — a date it falls due; later dues are derived from it, month-end clamped
- `ends_on date null`, `note` (≤ 300), `created_at`, `created_by` (staff email as at sign-in)

`cost_payments` — each time we actually paid
- `id`, `item_id` (FK), `period_for date` (which due date this settles; for one-time, the paid date)
- `paid_on date`, `amount_minor bigint`, `currency`, `inr_paise bigint` (what left the account, in rupees)
- `gst_paise bigint null` (the GST part, for the CA's input credit), `note`
- unique `(item_id, period_for)` so Mark paid twice is a no-op, never a double (`on conflict do nothing`); index `(paid_on, id)`
- CHECKs: kind and cadence paired (`(kind = 'recurring') = (cadence is not null)`); currency in INR, USD; amounts between 1 and
  1e10; `inr_paise = amount_minor` when INR; `gst_paise` between 0 and `inr_paise`; dates between 2020-01-01 and 2100-12-31;
  a one-time item is never `varies` and has no `ends_on`; text caps (note ≤ 300, `created_by` ≤ 320); FK `item_id` on delete restrict

Grants: items select, insert, update (no delete — end it instead); payments select, insert, delete
(delete is Undo for a mistaken payment). Money is integer minor units end to end (ADR-0004); USD is
cents, shown as dollars only where a person reads it. `inr_paise` for a USD cost is prefilled from the
latest `fx_rates` row (a new definer `admin_fx_rate_latest()` in 0170, granted to `frata_admin` only, revoked from everyone else; `app_fx_rate_latest` stays `frata_app`'s) and editable: the card statement wins.

### What is derived, never stored (SSOT)

All in one pure engine, `src/domains/admin/costs.ts` (no I/O; `now` is an argument):

| Fact | Derived from |
|---|---|
| Due dates | `anchor_on` + cadence, clamped (31 Jan → 28 Feb), up to `ends_on` |
| Next due, overdue, "3 unpaid" | due dates not matched by a payment's `period_for` |
| Monthly equivalent | amount ÷ 1, 3 or 12; USD × latest rate |
| Burn (monthly / yearly) | sum of monthly equivalents of live recurring items |
| This month spent | payments by `paid_on` in the IST month, summed in `inr_paise` |
| Financial year | Apr–Mar IST (`src/domains/time`) |

There is no status column. An item is live, ended or one-time from its dates and kind.

### The screen — `/admin/costs`

One page, three views as a tab row (`?view=`), phone and desktop:

1. **Overview** (default). Four figures: this month spent, monthly burn, yearly burn, due in 30 days.
   Below: **Due and overdue** list, each row with one primary action, **Mark paid**; then the month by
   category as a simple bar table (this month, last month, and the change).
2. **All costs.** A table, filter chips Recurring · One-time · Ended, search by name or vendor. Columns:
   name and vendor, category, amount, repeats, next due, per month. A row opens a side panel: payment
   history, Edit, Mark paid, **End** (asks for the date), Undo last payment.
3. **Payments.** Every payment, newest first, 50 a page, month filter, and **Export CSV** for a
   financial year (name, vendor, category, paid on, amount, currency, INR, GST) — for the CA.

**Add a cost** is one dialog, a two-way switch first: *Repeats* or *Once*. Repeats asks name, category,
amount and currency, repeats, next due on, "amount changes each time". Once asks name, category, amount,
paid on (today), GST if any, and saves the item and its payment together. Defaults are chosen so a
typical add is four fields.

**Mark paid** opens prefilled (paid today, the expected amount, the rate for USD); a "varies" item shows
the amount field empty and focused. Success is a toast with Undo.

**Empty state**: one picture-led card and a row of starter chips (Domain, Vercel, Supabase, Anthropic,
WhatsApp, Email, CA fees) that prefill the dialog's name and category. No amounts are guessed.

States drawn in the mockup: empty, loading, error ("We could not read costs. Nothing was changed."),
one, many, overdue, ended, USD row, no permission (support staff), phone.

### Who may

Master admin only (the stored role `admin`, `ADMIN_ONLY`), the same door as the fx rate. Support staff get a
panel: "Only a master admin can open Costs". No fresh-passkey step: nothing here moves money, it records it. Every write is audited
in the same transaction as the write (`tenantId` null) (`costs.item.add`, `.edit`, `.end`, `.pay`, `.unpay`; `auditStaff`, names of
changed fields only), and `costs` joins `MASTER_ONLY_WORDS` so support staff never see these rows in Activity.

### Reminders (phase 2)

A new `TODAY_SOURCES` entry `cost_due` (area `costs`, roles admin): one count read, overdue plus due
within 7 days, shown as the nav badge and a Today row "3 costs due this week". A source that fails is
"uncounted", never 0 (existing rule). No email, no WhatsApp.

## Code map

| Layer | File |
|---|---|
| Engine and tests | `src/domains/admin/costs.ts`, `__tests__/costs.test.ts` |
| Schema | `src/lib/db/schema-costs.ts`, `drizzle/0170_admin_costs.sql` (`--custom`) |
| Reads and writes | `src/lib/admin/costs.ts` (takes `StaffOk`, uses `adminDb()`) |
| Actions | `src/app/(admin)/admin/costs/actions.ts` (`requireStaff(ADMIN_ONLY)` first) |
| Page | `src/app/(admin)/admin/costs/page.tsx` + `_components/` (design-language primitives only) |
| Nav and Today | `admin/layout.tsx` Money group; `domains/admin/today.ts`, `lib/admin/today.ts` (phase 2) |
| Proof | `scripts/verify/tenancy.sql` (no role but `frata_admin` reads either table), one e2e flow `costs` |

## Phases

| Phase | Ships | Usable alone because |
|---|---|---|
| **C0** | Mockup artifact, approved by the owner | the gate before any code |
| **C1** | Tables, engine, tests, page: Overview, All costs, Add, Mark paid, End, Undo | the owner can record and see everything |
| **C2** | Payments view with CSV export, Today and nav reminders | year-end and renewals are covered |

## Tasks (after C0 is approved)

Regression net first, every task ends with its tests and `impact-reviewer` on its diff.

1. **Engine tests first**, then the engine: month-end clamp, 29 Feb yearly, quarterly, ended item, missed
   dues counted, USD conversion, IST month boundary, FY boundary. Verify: `npx vitest run src/domains/admin`.
2. **Migration + proof**: tables, grants, RLS, definer-only policy; add to `tenancy.sql` and `check:tenant`.
   Verify: `npm run verify:tenancy` on a throwaway Postgres, `npm run check:tenant`.
3. **Admin reads and writes** (`lib/admin/costs.ts`) with the audit rows. Verify: unit tests with the
   admin db fake, `npm run gates`.
4. **Page and dialogs** built as drawn. Verify: `e2e` flow `costs` at phone and desktop width;
   `mockup-parity-reviewer`, `design-system-reviewer`, `words-reviewer`.
5. **C2**: CSV export (server route, `Origin` checked, admin only), `cost_due` Today source.
   Verify: e2e, `npm test`, `npm run typecheck`.
6. **Production**: migration SQL printed with `scripts/prod-migrate.mjs`, applied, row inserted; push to
   `main`; production errors checked within the hour and next day.

## Design review (answers before sign-off)

- **UI/UX** — one primary action per view (Mark paid, Add). Merchant's model, not our tables: "due",
  "paid", "ends", never `anchor_on`. Constraints over refusals (cadence disabled for Once). Undo on
  every payment. Keyboard: dialog traps focus, rows are links, labels tied to fields.
- **Tenancy** — platform-scope, no tenant column, no merchant data, no `frata_app` grant; `frata_admin`
  only; proof block added. Tenancy-auditor runs on the plan after sign-off.
- **Modularity** — engine in `domains/admin`, reads/writes in `lib/admin` (Admin never uses `withTenant`),
  actions beside the page, rendering in `_components`. Extends Admin; touches no merchant module.
- **SSOT / DRY** — table above. The FX rate is `fx_rates`; categories are one exported tuple read by the
  CHECK, the form and the report. Vercel/Mux *usage* stays in Infrastructure; Costs holds the *bill paid*
  (a link on the Vercel and Mux items, no copying of numbers).
- **YAGNI (left out, with the signal that brings it back)** — receipts upload (the CA asks for one);
  auto-import from Infrastructure (three items drift from their bills twice); budgets and alerts per
  category (a month overshoots unnoticed); approvals or multiple payers (a second person pays); more
  currencies (a vendor bills in one); email reminders (a due date is missed twice despite Today).
- **KISS** — two tables, one engine, one page. No cron, no outbox, no new dependency; due dates are
  computed on read.
- **Scalability** — tens of items, hundreds of payments a year; no growth concern. No background work.
- **Performance** — Overview runs two reads (live items, payments of the month and last month) in
  parallel on one `adminDb` connection; no transaction held open across them (Admin has two connections).
  Payments view is keyset-paged by `(paid_on, id)`; index `cost_payments(paid_on, id)`.
- **Reliability** — no outbound calls. A failed read shows "We could not read costs", never a zero.
- **Security** — every action: `requireStaff(ADMIN_ONLY)`, Zod with length caps and amount ceiling,
  item id matched together with the row id, named fields in the reply; CSV is admin-only, `Origin`
  checked, formula-injection safe (cells starting `= + - @` are prefixed). Notes render as text, never HTML.
- **Unit economics** — changes no merchant price or fee. It supplies the burn the model's break-even
  uses; `unit-economics-reviewer` checks the burn feeds `frata-unit-economics` without a second copy.
- **Blast radius** — new files plus one nav group, one `TODAY_SOURCES` row, one activity word. Shared:
  Admin nav and Today; both covered by the existing today tests.

**Stress test** — written after the mockup, against the real code (severity · what · file · fix).

## Your calls (each with a recommendation)

1. **Who sees it** — Admin role only. *Recommended.* Alternative: support staff read-only.
2. **Currencies** — INR and USD. *Recommended.*
3. **Year for the CA** — Indian financial year, April to March. *Recommended.*
4. **Does it pull from Infrastructure** — no, record the bill by hand. *Recommended* for now.
5. **Is this the right time** — it moves no ranked problem; the exception is the owner's call, recorded here.

## Practices recorded in skills (landed with the build)

- `frata-architecture`: a bullet under Admin for Costs (platform-scope, ADMIN_ONLY, derived due dates).
- `frata-design-language`: the Costs rules the owner approves (cadence chips, Mark paid pattern).
- `frata-unit-economics`: the burn is read from Costs, not restated.

## Repetitive work → agents and scripts

| Chore | Becomes |
|---|---|
| Printing production SQL for 0170 | existing `scripts/prod-migrate.mjs` |
| Checking Costs stays Admin-only | `check:tenant` names the two tables |

## Deviations

| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| — | — | — | — |
