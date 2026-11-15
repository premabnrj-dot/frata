# Neel N2b — an order, an offer, a settings section, as drawn
Status: active (architecture, tenancy and unit-economics reviews folded in, 2026-11-15) · Date: 2026-11-15 · Spec: `docs/specs/2026-11-13-design-language-neel.md` § N2 ·
Mockup: https://claude.ai/artifact/GH5xX5ss5Xb9rLc5LwyVEC (source `docs/mockups/2026-11-15-neel-n2b/`) · Approved: owner,
2026-11-15 ("approved, continue with the plan and build"; Notes and Activity as one timeline; the courier choice on the
order page)

## Goal
Ranked problem 1 (COD/RTO losses) and 6 (true profit per order): the order page says what to do now in money, what this
order keeps if delivered or if it comes back, and how risky it is, before anyone packs it. Problem 3 for the offer and
settings forms (fewer wrong settings). Measures: share of COD orders confirmed before packing; RTO share of orders from
PIN codes the store blocked after the suggestion (from `orders.pincode`); time on the order page is not a goal.

## Phases (each its own commit series, reviews, parity)
- **N2b·1 The order page** (Main, OrderPhone, OrderStates boards).
- **N2b·2 The offer form** (Offer board).
- **N2b·3 Settings sections** (Settings board: Pay on delivery drawn; every section takes the same frame).

## What is drawn, and what we have (N2b·1)
| Drawn | Today | Change |
|---|---|---|
| Header: number, state chip, payment chip; "Today, 10:06 am · from Instagram bio · Ananya Rao"; Print · More · one primary (Mark packed) | Header with actions spread across cards | One primary per state (Confirm, Mark packed, Mark shipped…) from the existing actions; Print and More |
| The top line: "Collect ₹2,290 on delivery", a sub-line, the COD risk chip | The money line sits at the foot of Items; risk card only for unconfirmed | The line moves to the top, from the SAME derivation (one function, `orderTopLine` in `src/domains/orders/`), with the nine states drawn; the risk chip from `risk()` for every COD order not yet shipped |
| Items and totals | Same facts | Redrawn; "Edit items" as a link |
| Shipping: courier cards with price, days, "N% came back here"; Book; Ship another way | Ship another way only (name + AWB typed) | See Deviations: no Shiprocket connector yet. Cards for the couriers this store has used, each with its own came-back share (from `shipments.courier_name` × outcomes); picking one fills the courier name; "Ship another way" keeps the AWB field |
| What you keep: if delivered / if it comes back | Not on the order page | `orderProfit()` for this order, owner and whoever `seesCosts` only; costs stay on the server (ADR-0003) |
| Shopper: name, address, Call · WhatsApp, "2nd order · the first came back", PIN line | Name, address, phone links | Phone history (`orders_phone_history`, 0127) and the PIN's came-back count (the Analytics read), counts under 30 as "6 of 14" |
| Notes + Activity | Notes card, Emails card, Activity card | ONE timeline (owner, 2026-11-15): notes, emails and events by time, a note box on top |
| Phone: one column, Call/WhatsApp buttons, "Notes and activity ›", bottom action bar | Desktop columns stacked | As drawn |

## N2b·2 The offer form
| Drawn | Today | Change |
|---|---|---|
| "What kind" as four cards | Steps | Cards (a radio group) |
| The offer: name, code, take off (% / ₹), minimum bag, most off, starts/ends | Same fields across steps | One card, as drawn |
| "62% … already over ₹1,500" | Exists (qualify read) | As drawn, amber |
| What shoppers see (bar, bag) | Preview exists | Side card |
| What it costs you: "On a ₹2,490 kurta: ₹249 off. You keep ₹363 instead of ₹612." | Not there | `keptPerOrder` / `orderProfit` on the store's best-selling product (30 days), owner/seesCosts only; hidden when its costs are unknown |
| On which products · folded | Product picker step | A fold |

## N2b·3 Settings sections
| Drawn | Today | Change |
|---|---|---|
| One card per block, fields in a grid, hints under fields | Fields stacked, hints | The SettingsForm frame as drawn (every section) |
| Switch row with its line | Checkbox | `Switch` primitive |
| PIN codes as chips + "+ Add" | A text field | Chips (the stored value stays a list) |
| "From your returns: add 302012 (3 of 12 came back)" | Not there | The Analytics PIN read (highest came-back share, ≥10 with an outcome, not already blocked), one suggestion |
| At checkout preview | `preview: 'checkout'` exists | Side card as drawn |
| Save bar at the foot | Save bar | `placement="bottom"`, count |

## Regression net first
Flows that open these pages, run on main before any change: `41-orders` family (grep `/console/orders/` in e2e), `49-ship`,
`47-offers`, settings flows (grep `/console/settings/`), `77-order-edit`, `90-ux`. New `86-neel-order.mjs`,
`87-neel-offer.mjs`, `88-neel-settings.mjs` written first, failing.
Unit: `orderTopLine` (every state the board draws), the courier came-back share, the PIN suggestion pick.

## SSOT
- The top line: one pure function, read by the page and the phone; the words of today's foot line move into it (no copy).
- Profit: `orderProfit` only. The offer's cost line reads the same engine.
- Came-back shares: the outcome predicates in `src/lib/db/order-predicates.ts`, as Analytics.

## Deviations (proposed; owner sees them before ship)
| Mockup element | Built | Reason | Owner seen |
|---|---|---|---|
| Money words on the order and the offer (drawn: "after cost, courier, fees", "both courier legs", "pays back at 1.7×", "4% came back here") | The words above (unit-economics review) | A fact the mockup got wrong: each drawn line said less or other than the engine computes | — |
| Sub-lines "Confirmed on WhatsApp at 10:14 am", "No reply on WhatsApp yet", "Refused at the door", "Remitted by Delhivery on 23 Nov", an email "· opened" | Facts we record (confirmed time, risk reasons, cancel reason, delivered date); the rest left out | No row records a WhatsApp reply, an NDR reason, a remittance or an open | — |
| Top line cases not drawn | Today's words for held-and-paid, delivered prepaid, came back after paying, lost, cancelled with a refund, not paid yet; and today's CA and "ask the owner" sentences on two drawn cases | An accounting step and a role step a merchant needs; the board drew nine of fourteen cases | — |
| Notes and Activity (separate cards drawn) | One timeline | Owner, 2026-11-15 | Yes, 2026-11-15 |
| Shipping on a To pack order (drawn beside Mark packed) | The Shipping card once the order is packed | An order is packed (its invoice issued, its stock taken) before it ships; marking it shipped first would skip both | — |
| Courier cards with price and days, "Book Delhivery · ₹78" | Cards for couriers the store has used, each with its came-back share; picking one fills the courier; booking stays "Ship another way" (name and AWB) | No Shiprocket connector exists (no rates, no booking). It is its own phase: current facts on Shiprocket's API and terms first (`frata-integrations`, 90-day rule) | — |

## Architecture review on the plan (2026-11-15), folded in
**The top line** — `orderTopLine(o, state, { owed, refund, canCancel })` in `src/domains/orders/top-line.ts`, pure, returns
`{ tone, line, sub, money }` (words and paise, no JSX); the page and the phone read it; today's foot line goes. Every case
today has a row; drawn cases take the drawn words, the rest keep today's:
| Case (today) | Built line · sub |
|---|---|
| unconfirmed / held | drawn: "Confirm it before you pack" · the risk reasons' first line (not "No reply on WhatsApp", which no row records) |
| held and paid | today's words |
| COD, to pack or on the way | drawn: "Collect ₹N on delivery" · confirmed time if confirmed, else none |
| paid online (not after a switch) | drawn: "Paid online. Collect nothing." · "Razorpay · paid at <time>" |
| paid online after packing for COD | drawn line "Paid online after packing. Don't collect cash." · drawn sub, PLUS today's "The invoice stays as issued. Ask your CA if it needs a credit note." (kept: an accounting step) |
| refund due | drawn: "Refund ₹N in Razorpay" · "Paid after it sold out. Cancel it first." + today's "Ask the owner or a manager to cancel it." when this person can't |
| delivered COD | drawn: "₹N collected by the courier" · "Delivered <date>." (remittance: no row records it) |
| delivered prepaid | today's "Delivered." |
| came back (unpaid) | drawn: "Coming back. Nothing was collected." · the courier's word if the shipment has one, else none |
| came back after paying online | today's words |
| lost (paid / unpaid) | today's words |
| cancelled (nothing / with refund) | drawn "Cancelled. Nothing to collect." · the cancel reason; with a refund, today's words |
| not paid yet | today's words |
- **What you keep** — one pure `orderKeep(row, estimate, feeBps)` in `src/domains/orders/kept.ts`; `keptOf` uses it (no second
  copy of freight, fee and restock rules). Its inputs are read in `orderDetail`'s transaction only when `seesCosts`. Before
  an outcome, "if it comes back" assumes the pieces go back in stock (says so); unknown goods cost or no courier estimate:
  the card says which is missing.
- **Shopper history** — from the RiskFacts `orderDetail` already loads (`earlierOrders`, `cameBack`): no new read.
- **One primary action** — `primaryAction` (`src/domains/orders/work.ts`) decides it, as today; Print is not a second
  button when the primary is the packing slip; shipping stays in the Shipping card (it needs a courier and an AWB). The
  risk reasons, next step and Call/WhatsApp stay as a "High risk" region under the top line when high (flow 50).
- **Courier shares** — a predicate `cameBackSql` moves to `order-predicates.ts` first (Analytics uses it too); couriers by
  `lower(trim(courier_name))`, open shipments only, last 180 days, counts under 30 as "6 of 14"; no shipments yet: the
  card shows "Ship another way" only. EXPLAIN at 10× (speed-reviewer).
- **PIN line and suggestion** — one query module, one window (180 days), serves the order page and Settings; the
  suggestion only when the PIN's came-back share is above the store's own by 10 points with 10+ outcomes; measured, or a
  `(tenant_id, pincode)` partial index if slow. Accepting it is recorded (an event) so the measure means something.
- **Timeline** — a note shows once (its text on its `note_added` event); support's notes marked through that event; the
  email rows keep their actions (fix the address, send again) inside the timeline, gated as today (`canAct`).
- **Reads** — `riskFactsFor` and `orderPrefixFor` fold into `orderDetail`'s one transaction.
- **Offer cost line** — `coreBestSellers` limited to the offer's products; the client gets derived figures only (kept at 0
  off, the change per ₹ off), never `unit_cost`.
- **Settings chips** — a `ChipInput` primitive (the stored value stays a list); switch rows exist.
- **Regression net (corrected):** 40-queue, 50-order-page (regions Activity, Notes, High risk; "Cancelled. Nothing to
  collect."), 60-documents (`/^Collect ₹/`), 71-email (the Emails card), 77-order-edit (region Activity), 49-ship (label
  Courier), 47-offers, the settings flows. Each locator that moves changes in the task that moves it.

## Unit-economics review on the plan (2026-11-15), folded in
Every figure comes from the engines (`orderProfit`, `taxOrder`, `freightOf`, `deliveredFee`, `keptPerOrder`), never typed;
the mockup's ₹612 / −₹186 / ₹363 were illustrative and do not agree with each other. The words, so they are true:
- **If delivered** ₹N, under it: "After GST, goods, courier and Frrata's fee. Before ads and packaging."
- **If it comes back** −₹N, under it: "Courier both ways." and, when the pieces can't go back in stock, the second figure
  "−₹M if it can't go back in stock" (which case is shown is said; whether it restocks is not known before it returns).
- Frrata's fee is named where it applies: "Frrata's fee ₹42.69 only if delivered." On the goods after the offer, without
  GST, delivery or the COD fee, at the plan in force when it shipped (`feeForOrder`).
- A line whose goods cost or courier estimate is unknown shows nothing (never ₹0): the card says which cost is missing.
- **The offer:** "On a ₹2,490 kurta: ₹N off. You keep ₹A instead of ₹B." from the engine (the GST inside the discount is
  counted). "Pays back at 1.7×" goes: it is per delivered order and ignores those who would have bought anyway. In its
  place: "To keep what you keep today, you'd need about 1.2× the orders. 62% of them already qualify." (`keptPerOrder` at
  the store's own came-back share).
- **Courier lines:** "4 of 96 of your orders came back" (counts under 30, as "6 of 14"), not "4% came back here" (it reads
  as this PIN, and a courier does not cause it).
- Hypothesis H-resale (a return is worth its full cost) stands behind "−₹156"; its test is in frata-unit-economics.

## Tenancy review on the plan (2026-11-15), folded in
- **Costs read only when shown.** "What you keep" and "What it costs you" call `costsVisibleIn(tx, tenantId, role)` inside
  the same `withTenant`; when false, `unit_cost`, plan history and ship costs are never selected (not hidden at render).
  Only totals travel (if delivered, if it comes back; off, keep before, keep after), never the breakdown (its fee line
  shows the plan rate). A support visit runs as owner and sees costs today, as Analytics does (roles.ts); a change to that
  is an owner rule in roles.ts, not this page's.
- **The offer's best seller** is a new uncached read beside `offerStats` (src/lib/queries/discounts.ts), never the
  storefront's `shopBestSellers` cache.
- **Order page reads** (phone history, PIN came-back count, courier shares) join the `Promise.all` inside `orderDetail`'s
  `withTenant`; phone and PIN come from the order row read there; every query names `tenant_id` (the courier read joins
  `shipments` to `orders` on `tenant_id` and `id`); counts only, never another order's name, address or ₹; an erased
  order (no phone) skips its history; the phone predicate stays `standingSql` (0127's index).
- **Settings PIN suggestion** in the settings page's `withTenant`, counts only, the blocked list read in the same transaction.
- **The timeline** merges what `orderDetail` already reads (notes, emails, events): no new read, no cache; a support
  visit's entries keep "· Frrata support"; the note box keeps `addOrderNote`; no email send in a visit.
- Nothing new uses `cache()` or `unstable_cache`; `courier_name` is merchant text, rendered as text.

## Design review
- **UI/UX:** one primary action per state; the top line in money; risk in words; every state on the OrderStates board;
  phone first-class; Rule 0 (no helper text beyond the drawn lines).
- **Tenancy:** new reads (courier shares, phone history, PIN line, best seller for the offer) all in `src/lib/queries/` with
  `withTenant`; the tenant from `requireMember`.
- **Unit economics:** money shown, not changed; `unit-economics-reviewer` on the "What you keep" and offer cost words.
- **Security:** costs only to `seesCosts`; no new action beyond the note (exists); the courier pick reuses `shipOrder`.
- **Performance:** the order page adds three reads; one `Promise.all` with today's; EXPLAIN at 10× in `speed-reviewer`.
- **YAGNI:** no Shiprocket in N2b; no editing in the timeline beyond adding a note.

## Practices recorded in skills
frata-design-language § Neel order page (the top line, one timeline), § Neel forms (settings frame, switch rows, chips).
