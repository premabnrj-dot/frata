# True Profit (the first add-on) and A3 — self-serve add-on trials
Status: draft · Date: 2026-11-12 · Owner: "Build True Profit + A3" (2026-11-12, over A3 alone or waiting) · Mockups:
A3's trial screens are in the approved Apps gallery mockup v1 (2026-11-11: "Start free trial", its confirm, "In
trial"); True Profit's home is new — `docs/mockups/2026-11-12-true-profit.html`, for the owner's sign-off before
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
