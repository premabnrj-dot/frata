# Neel N2b — an order, an offer, a settings section, as drawn
Status: draft (for the review agents) · Date: 2026-11-15 · Spec: `docs/specs/2026-11-13-design-language-neel.md` § N2 ·
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
| Courier cards with price and days, "Book Delhivery · ₹78" | Cards for couriers the store has used, each with its came-back share; picking one fills the courier; booking stays "Ship another way" (name and AWB) | No Shiprocket connector exists (no rates, no booking). It is its own phase: current facts on Shiprocket's API and terms first (`frata-integrations`, 90-day rule) | — |

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
