# True Profit (the first add-on) and A3 — self-serve add-on trials
Status: built (True Profit and A3, 2026-11-12; DZ shipped A3 first) · Date: 2026-11-12 · Owner: "Build True Profit + A3" (2026-11-12, over A3 alone or waiting) · Mockups:
A3's trial screens are in the approved Apps gallery mockup v1 (2026-11-11: "Start free trial", its confirm, "In
trial"); True Profit's home is new — `docs/mockups/2026-11-12-true-profit.html` (https://claude.ai/artifact/XsfTjzmh8nYqFpbFBCLSth), for the owner's sign-off before
any of TP is built.

## Goal
Ranked problem 6 (true profit per order) and 1 (COD/RTO losses): a brand sees which products, sizes, colours and
pincodes keep money after returns and which lose it, so it can stop pushing a loser and stop shipping COD where it
always comes back. A3 makes add-ons something a shop can try and keep without a WhatsApp message. Measure: trials
started; trials kept past day 14 (the ₹ nudge hypothesis's sibling: "a 14-day trial converts ≥ 25%"); products or
pincodes acted on (COD off for a pincode, a product hidden) within 30 days of a trial.

## What is core today, and stays core (never moved behind the add-on)
₹ kept per order (Orders), ₹ kept by source and campaign (Analytics), profit per order in the order page. These are
every plan's (CLAUDE.md: "Orders with profit per order"). True Profit adds only what is NEW:
1. **By product** — ₹ kept after returns per product over 30 / 90 days, with its delivered, returned and lost counts
   and its return rate; best and worst first.
2. **By size and colour** — a product opens its variants: which size returns (fit) and which colour earns.
3. **By pincode** — ₹ kept and return cost per pincode (COD vs prepaid), worst first; the pincodes where COD
   costs more than it brings in, named.
The showcase's "By campaign" feature, and the OFF line "Profit per order leaves Orders and Analytics", are wrong
for this scope and are corrected.

## How the numbers are made (one engine, no second copy)
- **As built (review fixes 2026-11-12):** no separate `allocate.ts`; the line share is in SQL (`true-profit.ts`) and
  `keptOf` takes it as `share`; a partner before handover sees costs as everywhere (`costsVisibleIn`); "Per order" is per
  order counted, not per delivered order. Scale's features gain True Profit by migration 0116, as 0113 did for Delivery Zones.
- `kept.ts` stays THE rule. Its SQL twin groups by what decides the figure; True Profit adds a grouping key:
  `pincode` (order level, exact) and `variant` (line level).
- **A line's share of an order's costs:** freight, the gateway's fee, the COD fee and Frrata's fee are order-level;
  a line carries them in proportion to its `taxable_value` within the order (integer paise, largest-remainder so the
  lines sum to the order exactly). COGS is the line's own. Pure `allocate()` in `src/domains/orders/allocate.ts`,
  tested: lines sum to the order's `orderProfit` to the paisa.
- Left out and counted as left out, as `kept.ts` does (unknown COGS, freight pending). Before ads and packaging.
- Reads: `src/lib/queries/true-profit.ts`, one `withTenant` per page, grouped in SQL (never per-order rows to Node:
  the analytics speed rule), CAN_MANAGE only and never staff/partner (costs), `mayReadMoney`-style refusal.

## A3 — self-serve add-on trials (as drawn in the approved mockup)
- **Start free trial** on an add-on's page (owners and admins in person, `managesInPerson`), when the plan may buy it
  (`addOnAllowed`) and the shop never trialled this add-on before. The confirm: "14 days free, then ₹999/month +
  18% GST from 26 Nov. End the trial before 26 Nov and nothing is charged." · Not now / Start free trial.
- One action writes, in one transaction: the trial row (`trial_ends_at` = now + 14 days) and the paid row starting at
  that moment (`addon_price_id` = the current version, `starts_at` = trial end) — so the price agreed is the price
  billed (a later price is a new version; the row keeps its own). The module is switched on (`tenant_modules`).
  Audited (`addon.trial.start`, the price id and the first charge date).
- **In trial**: the app's home says "Trial · 9 days left" (state badge) and Usage and billing shows "Then ₹999/month
  + GST from 26 Nov" with **End trial**. End trial closes both rows now (`ends_at`) and turns the app off; nothing is
  billed (the bill reads only paid rows, from their `starts_at`).
- **After the trial** it is a paid add-on, billed by days from the trial's end on the next invoice (computeBill as
  today). Its home's foot says **Stop True Profit** (ends the paid row at the end of the month already billed — the
  plan rule: add-ons are billed in advance; or now with the days refunded as a credit? → unit-economics review).
- One trial per shop per add-on, ever (a unique partial index); Admin's own trials (30 days, no paid row) unchanged.
- A Notice 3 days before the trial ends ("True Profit starts at ₹999/month on 26 Nov"), through the outbox (E·1's
  Notices), and on the bill the line says "True Profit, from 26 Nov".
- "Ask Frrata to add" remains only where self-serve is not allowed (the plan cannot buy it).

## Phases
- **TP·0 (mockup + reviews):** the True Profit mockup signed off; this plan reviewed (architecture, tenancy, security,
  unit economics, speed). Nothing built before.
- **TP·1:** `allocate()` + the grouped SQL + the three views behind the module gate; True Profit `status: 'now'`.
- **A3·1:** migration (one-trial index), `startAddonTrial` / `endAddonTrial` / `stopAddon` actions, the confirm, the
  trial states on the page and home, the Notice, bill line wording; e2e: start → 14 days (clock moved) → billed line;
  end before → nothing billed.

## Out of scope (and what brings it back)
- Reviews and Marketplace export: their own builds (they are the next add-ons, using A3 unchanged).
- Annual add-on pricing; add-on bundles.
- A per-campaign view inside True Profit (Analytics already judges campaigns on ₹ kept).

## Design review (frata-planning § 3) — first pass, the agents complete it
- **UI/UX:** True Profit's home is AppHome (Overview · Products · Pincodes · Usage and billing). States: no outcomes
  yet, costs missing (counted, with "Add costs" to the products missing COGS), one product, many, phone (rows),
  staff/partner (never: the app's page says "Owners and admins see costs"), load error. A3: never trialled /
  in trial / paid / ended / plan can't buy it / support visit (no button).
- **Tenancy:** a migration on `tenant_addons` (index only); reads through `withTenant`.
- **SSOT:** kept.ts is the rule; allocation is one function; the trial's price is the paid row's version.
- **Unit economics:** ₹999/month on any plan — check the three stores (a ₹599 × 300 shop: 0.56% of GMV), Frrata's
  cost to compute (DB time), trial → paid conversion hypothesis, and stop-now vs end-of-month.
- **Security:** costs are owners' and admins' only; actions `managesInPerson`; the confirm states price and date
  (consumer-protection: no dark pattern, CCPA 2023 guidelines on drip pricing and subscription traps).
- **Performance:** grouped SQL over 90 days of orders at 10× (≤ 300 ms); indexes on order lines by variant and
  orders by pincode checked by speed-reviewer.
- **Blast radius:** registry status flips (true_profit next → now), the gallery filters, e2e 45 (its interest row was
  Reviews), billing flows (62) for the paid row.

## Review findings
(filled after the agents run)

## Review findings (2026-11-12) — folded in; owner calls marked
| Agent / finding | Fix in the plan |
|---|---|
| Security C1 / Arch B3: `frata_app` has only SELECT on `tenant_addons`; a grant would let app code write any trial length or price | Definers `app_start_addon_trial(module, shown_price_id)`, `app_end_addon_trial(module)`, `app_stop_addon(module)`: tenant from `app_current_tenant()`, times from `now()`, price = the module's newest version and must equal the one shown; composite FK `(addon_price_id, module)`; tenancy proof row; tenancy-auditor |
| Arch B1 / Security H1 / UE1: add-ons bill in advance; days after a mid-month trial end are never billed, and a trial spanning the 1st is billed before it ends | An add-on twin of the plan trial's rules: a row in force on the 1st is billed in advance; a row that began during M−1 is made up by days on M's invoice; a trial running on the 1st is billed in arrears. Bill tests for both; e2e across a month end |
| Arch B2 / UE4: `allocate()` per order can't run on grouped SQL; `n` counts lines; credits are per order | Allocation in SQL as a weight per line (`taxable_value / merchandise_net`), sums weighted, line returns from `credit_note_lines.order_line_id` (credits with no lines spread by weight); a parity test against a pure `allocate()`; rounding per group, not "to the paisa" |
| Security H2 / Arch M5: Admin's End closes only the trial row | Admin's End goes through `app_end_addon_trial` (both rows) |
| Security H3 / Arch M4: one-trial index would catch Admin's trials | `by_shop` column; unique `where trial_ends_at is not null and by_shop`; refuse self-serve when any earlier trial exists; the `trial:<tenant>:<module>` advisory lock |
| Security M1 / Arch M6: price shown vs price charged | The confirm posts the price id it showed; refused with a reload if no longer current |
| Security M2 / Arch M7: the Notice | The daily outbox sweep finds self-serve trials with 3 days left, writes the Notice (new `source_kind`, migration) and enqueues the email with dedupe key `addon-trial-end:<row>`; End trial before then means none is written; the sender re-checks the trial is live |
| Security M3 / Arch M8: who sees costs | `seesCosts` via `costsVisibleIn` inside the page's one `withTenant` (a partner before handover sees them, as everywhere); `server-only`; new field names in cost sentinels |
| Security M4: Apps' off switch on a paid add-on leaves it billed | On a paid add-on, Turn off IS Stop (one confirm saying when billing ends) |
| Security M5: in-person checks, consent evidence | `managesInPerson` inside the definer's transaction; `where ends_at is null … returning`; the audit row carries the price paise, the first charge date and the confirm's copy version |
| Security L1: one date | The trial ends at 23:59:59 IST on day 14; that one date everywhere |
| Security L2: a pincode with one order identifies a shopper | Pincodes with fewer than 5 orders merge into "Other pincodes" |
| CCPA 2023 (drip pricing, subscription trap) | The confirm shows the GST-inclusive monthly total (₹1,178.82), that the first month is charged by days and on which invoice, and how to end it; the T−3 Notice is required and links End trial; End trial and Stop are one click + one confirm on the home and in Usage and billing; no retention screen |
| Arch 9: pincode × keys ≈ one group per order | Top 50 pincodes by order count first (index-only), then ₹ kept for those; variants only for the product opened; EXPLAINs in the plan before TP·1 ships (speed-reviewer) |
| Arch 10: "which size returns" mixes RTO with line returns; overlaps Size and fit | "Returned" per line = RTO of the order or a credit note line; one return-rate-by-variant read that Size and fit will reuse |
| Arch 11: no mandate, plan-trial pause | A shop with no autopay sees the add-on on its next invoice like any line; the pause covers the add-on too (no add-on billed while the plan is paused) |
| Arch 12: blast radius | `OfferAction` gains `trial` and `in_trial`; e2e 45's Admin-trial count; an ended shop is offered "Add True Profit · ₹999/month" (no second trial) |
| Arch 13–15 | CHECK `ends_at >= starts_at`; a not-yet-started paid row closes at its own `starts_at`; the bill line's date from `periodStart`; deleted variants group under "Removed products" |
| UE3: few pincodes lose money on COD before ads | Each pincode's ₹ kept is shown; "COD loses money here" only past the shop's own break-even (orderProfit at that pincode's RTO) |
| UE5: stopping a paid add-on | It runs to the end of the month already billed, no credit (add-ons are billed in advance); one not yet billed ends now |
| UE7: trial→paid counts inertia | Measure also: still paid at day 60; an action within 30 days (product hidden, price changed, COD off once RTO Shield ships) |
| **UE2 (owner): store B (₹4,500 × 80) pays more than Shopify's free profit apps** | **Owner call** — see below |
| **UE (owner): test demand before building A3** | **Owner call** — see below |

## Owner calls (2026-11-12)
- **Placement:** Scale includes True Profit (`plan_versions.features` for a new Scale version — an Admin step, not a
  migration of prices); Launch and Growth buy it at ₹999/month + GST with a 14-day self-serve trial (`addOnFor`:
  launch, growth). Recommended by the unit-economics review (store B pays more than Shopify's free apps on Growth;
  Scale shops pay ₹11k–22k elsewhere).
- **Order:** True Profit and A3 are built together now, with every fix above; demand is measured from real trials
  (kept past day 14, still paid at day 60, an action within 30 days). The 10-partner Admin-trial test was declined.
- **Mockup approved** (owner, 2026-11-12), with the review changes above. **On hold:** the owner wants a PIN-code
  delivery system planned first ("we need a PIN code based system, delivery system before we plan this more
  effectively"), since True Profit's pincode view and its COD-by-pincode action depend on it.
