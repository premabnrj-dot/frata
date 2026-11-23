# Admin › Costs — bills filled in from the vendors
Status: active · Date: 2026-11-23 · Mockup: https://claude.ai/artifact/1tQ7VNtR4jKhSYhy5NWSAm § 8 (`docs/mockups/2026-11-23-admin-cashflow.html`) · Approved: owner, 2026-11-23 (screens and the recommended calls; Anthropic and Supabase auto-fill skipped for now)

## In short
Costs gets a way to take a vendor's own figure for a bill. It never writes a payment you have not seen: the figure
fills the bill for you to confirm, and **recording turns on for a vendor only after you have matched one month.**
Vercel first. Anthropic after an admin key is connected. Supabase stays typed.

## Goal
Like Costs, it is an operational request (owner, 2026-11-23). Measure: for each connected vendor, the recorded month
equals the vendor's invoice in dollars within one cent, and the rupees the owner confirms differ from the estimate by
what the card statement says, nothing more.

## What can be read (checked 2026-11-23; `integration-researcher`; the sources are in `frata-integrations`)
| Vendor | By API | Reads as | Gaps |
|---|---|---|---|
| Vercel | Yes, already: hourly into `infra_usage_daily` (`src/lib/connectors/vercel/billing.ts`) | Daily charges per service in micro-dollars | No source says the charges sum to the invoice (platform fee, credit, on-demand, tax); no latency source; not re-read this week (vercel.com did not resolve in the research session) |
| Anthropic | Partly: the Usage and Cost API with an **admin key** (`sk-ant-admin01-…`, made by a Console organisation admin; no scopes; expiry fixed at creation) | USD cost per day, by workspace, model and token type, after discounts and before credits; Managed Agents show as `session_usage` ($0.08 a session-hour) | Credits and Priority Tier fees are not in it; the invoice is a monthly Stripe invoice with no API; values can change until about 7 days after the month ends; GST for India unconfirmed |
| Supabase | **No** | — | No organisation billing or invoice endpoint; invoices are in the dashboard and email, in USD, card only |
| Mux | Yes, already, same table | Daily charges | As Vercel |

## Design
### How a bill is filled
- A cost may name a **source**: `cost_items.source` (null, `vercel`, `mux`, `anthropic`), CHECKed. Setting it is a choice in
  the cost's Edit details (one value; Supabase and anything else stay null).
- For a source item, the due row shows the vendor's figure for the bill's month, tagged **From Vercel**, and **Mark paid**
  opens with that amount and the estimated rupees (the day's typed rate), exactly as the dollar prefill does today.
  The person types what the card statement says; nothing is saved until Mark paid.
- **Recording** (per vendor, off by default): after one bill for that vendor was marked paid with the amount unchanged
  from the vendor's figure, the Connections list offers "Record Vercel bills for me". On, a daily job records the payment
  itself for months that are final (Vercel: the month closed; Anthropic: the month ended at least 8 days ago), with the
  rupees estimated and the payment tagged **Confirm rupees** until the person types the card figure. An audit row is
  written by the job's own actor ("Frrata" staff-less system row), never as a person.
- A payment tagged estimated counts in Costs and Cashflow at its estimate; confirming it changes only `inr_paise` and `gst_paise`.

### Where the figure comes from (SSOT)
Vercel and Mux: summed from `infra_usage_daily` for the item's month; no second pull. Anthropic: a new read through a
connector `src/lib/connectors/anthropic/cost.ts` (`fetchWithTimeout`, no outbox, a read with no effect at the vendor), writing
its daily rows to the same `infra_usage_daily` (source `anthropic`; the table's CHECK and the source tuple gain the value)
so Admin › Infrastructure shows it too. The admin key is a Production-only secret read through `secret()`
(`ANTHROPIC_ADMIN_KEY`, one owner module, never the Studio key, never reaching the browser or a log), refused if a call
shows it can read more than cost.

### Data
`cost_items.source text null`; `cost_payments.estimated boolean not null default false`; a column-level
`grant update (inr_paise, gst_paise, estimated, note) on cost_payments to frata_admin` (check:tenant § 10 and proof § 102
are updated to allow exactly that); `cost_auto` — `source`, `on boolean`, `since date` (one row per vendor). Everything else is derived.

## Screens (mockup § 8)
Connections: a row per vendor with its state (Connected, Not connected, Manual), "Connect" for Anthropic, and the
"Record … for me" switches (disabled until a month is matched). Costs list: an **Auto** or **Manual** tag and a **Confirm
rupees** chip on an estimated payment. No new page.

## Design review (the agents run after sign-off)
Security: the admin key is the widest secret here (full organisation access); it needs its own review, a rotation date shown
on the Connections row (expiry chosen at creation), and `check:config` to confirm one reader. Reliability: a failed read leaves
the bill typed by hand; never a zero. Tenancy: platform scope only. Unit economics: none. Words: "Confirm rupees", "From Vercel".

## Phases
**A1** Vercel and Mux: the source choice, the prefilled bill, Confirm rupees (no new connector). **A2** Recording on, per vendor.
**A3** Anthropic: the admin key, the cost connector, its rows in Infrastructure. **Deferred by the owner, 2026-11-23: A3 and Supabase wait.** Supabase stays manual.

## Out of scope, with the signal that brings it back
Supabase (a billing API appears), reading invoices or PDFs (a vendor offers an invoice API), several workspaces (a second
Anthropic workspace is billed), GST input credit from vendor invoices (the CA confirms Anthropic and Supabase issue GST invoices).

## Facts used
See `.claude/skills/frata-integrations/reference/anthropic.md` § Reading Anthropic's bill and `reference/platform.md`, both dated 2026-11-23.
