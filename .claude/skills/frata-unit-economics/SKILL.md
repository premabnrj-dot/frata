---
name: frata-unit-economics
description: Use when setting or changing Frata's pricing tiers, per-order fee, what a tier includes, or when computing profit per order, contribution per ₹100, RTO impact, ad savings, break-even tenants or funding need - to keep every number a dated hypothesis with its test, and to compare against the right baseline.
metadata:
  version: 2.14.0
  verified: 2026-11-12
  covers: ["src/domains/orders/profit.ts", "src/domains/money/**"]
---

# Frata unit economics

## The one formula

Profit per order is `orderProfit()` in `src/domains/orders/profit.ts` — if
delivered, if returned, if lost by the courier, and expected (weighted by delivery probability). The
console, analytics and any model use it; nobody computes a margin inline.
Contribution per ₹100 is `contributionPer100()`. Money in paise.

- **A prepaid return** (`ifRto`) also loses the gateway's fee: the payment is refunded and the gateway keeps it
  (unit-economics review 2026-11-08).
- **A return NOT put back in stock loses its goods** (2026-11-12): `orderProfit` takes `restocked`, and `ifRto` adds
  COGS when it is false. The fact is the came-back event's own record (`order_events` kind `rto`, reason `restocked`,
  written only by `markCameBack`, never undone), read in SQL by `rtoRestockedSql` (`src/lib/db/order-predicates.ts`),
  the one rule for ₹ kept in Offers (`keptSql`) and Analytics (`windowSql`) alike; `kept.ts` groups by it. Nothing is
  stored twice. A return not restocked with unknown COGS is left out (counted), never ₹0; a restocked one needs no COGS.
  A return started but not yet back (Shiprocket's RTO in transit, when S·1 writes it) has no came-back event yet, so
  it counts as not restocked until the event says so. A restocked piece at full cost is hypothesis H-resale (below).
- **A courier line not arrived yet** (Shiprocket): the shop's confirmed estimate stands in for that line, labelled
  estimated; only with no estimate is the order pending and left out (never ₹0).
- **Lost by the courier** (`ifLost`, unit-economics review 2026-11-08): −(forward freight + packaging + ads + COGS +
  the gateway's fee); no return leg, no COD fee, no Frrata fee (a lost parcel is never billed). A courier's claim is
  not counted until a column records it. Freight for each outcome comes from `freightOf` (`src/domains/orders/freight.ts`).
- **₹ kept after returns** (`src/domains/orders/kept.ts`, Offers and Analytics alike): what delivered orders earned
  minus what returns and lost parcels cost, over orders with an outcome. Known costs only (orders carry no packaging or
  ad spend: "before ads and packaging"); an order whose COGS or courier line is unknown is left out and counted as left
  out, never ₹0. A source or an offer is judged on ₹ kept after returns, and per order with an outcome, never per
  delivered order alone. The fee is the plan version in force when the order becomes billable, the first of delivered
  and 30 days shipped (`feeForOrder`, billing's rule).
- **Credit notes after delivery** (GST phase 2, 2026-11-09): a return, a discount agreed before the sale or goodwill
  takes its **taxable** value off what the order earned (`creditedSql`, read by keptSql and Analytics alike; the GST on a
  credit was never the merchant's money; goodwill carries none, so all of it comes off). Goodwill is capped at what is
  left on the invoice. **Returned pieces put back in stock** (2026-11-11: the return's "Put these pieces back in stock"
  tick, on by default; `credit_note_lines.restocked_qty`) are back on sale, so their cost comes off the order's COGS:
  `restocked_qty × order_lines.unit_cost` as stored at placement (`cogsSql`, keptSql and Analytics alike; a line with no
  unit cost adds nothing back, never a guessed cost). A return **not** restocked keeps its cost, and a discount or
  goodwill never restocks. Counting a restocked piece at its full cost is hypothesis **H-resale** ("a returned piece
  is worth its full cost"), test: grade returns at 2–3 design partners for 4 weeks. Not yet counted:
  the reverse-pickup freight on a return (~₹70; label figures "before return pickup" until a column records it).
  **Owner, 2026-11-12 (replaces 2026-11-09):** a returned item isn't billable. Frrata's fee is on what the shopper
  kept: `merchandise_net` less the taxable value of `return` credit notes (`returnedSql`). Before the fee is billed, the
  billing draft charges it on that; a return after billing gives back the fee on the returned value on the next
  invoice (`returnCreditDue`, a `frrata_fee_credits` row of kind `return`; a later came-back or lost credit gives back
  only what is left). ₹ kept counts the fee the same way. Discount and goodwill notes don't change the fee. Only a note
  issued within the return window + 15 days of delivery moves the fee (nothing ties a note to goods coming back).
  Cost (unit-economics review 2026-11-12, illustrative): at a 20% return rate, −11.5% (Launch) to −14.8% (Growth) of
  Frrata's revenue per tenant; break-even moves from ~471 to ~546 tenants. Watch: returned value ÷ delivered value per
  shop (flag above 2× the cohort median or 35%); test at 3 design partners over 8 weeks.
- **The inclusive-price gap** (rates.ts, ₹2,625.01–₹2,950 with GST): one paisa above ₹2,625 moves a piece from 5% to 18%
  (₹269.91 less kept on a ₹900-COGS piece); there, a discount down to ₹2,625 RAISES kept. "A blanket % off is a giveaway"
  holds only below the gap; the console warns on prices in it.

## Rules

1. **Every number is a hypothesis** with a source, a date and the test that
   would prove it. Write them as a table: figure · source · date · test.
2. **The baseline is Shopify + the India app stack** (GoKwik or Fastrr checkout,
   Shiprocket, a WhatsApp tool) — not bare Shopify. A gain that the app stack
   already sells is not a Frata gain.
3. **Shopify India today** (shopify.com/in/pricing, 2026-11-06): Basic ₹1,499
   yearly / ₹1,994 monthly; Grow ₹5,599 / ₹7,447; Advanced ₹22,680 / ₹30,164;
   third-party gateway fee 2% / 1% / 0.6% on prepaid; COD exempt.
4. **Charge on delivered orders** (decided, owner 2026-11-06): the fee is a
   percentage of each DELIVERED order's value — Launch 2%, Growth 1%, Scale
   0.5% — on EVERY delivered order (included orders are a flag threshold,
   not free orders), of the order value excluding GST and shipping — stored
   as basis points on the plan version. A returned COD parcel
   costs the merchant nothing from Frata. Compare honestly: Shopify charges
   2/1/0.6% on prepaid orders only and nothing on COD, so on a COD-heavy
   merchant Frata's fee is larger per order; the bundle (checkout, WhatsApp,
   RTO tools included) has to carry the difference. The fee base is the
   order's `merchandise_net` (the lines' taxable value), never `net_revenue`
   (which includes delivery and the COD fee) — unit-economics review 2026-11-07.
4b. **The gateway's fee is what it charged, in paise** (2026-11-07): Razorpay
   charges on the GROSS total and adds 18% GST to its fee, so `orderProfit`
   takes `gatewayFee: Paise` from the captured payment (`orders.gateway_fee`,
   which includes `gateway_tax`), and `estimateGatewayFee(total, bps)` until
   it lands. On a ₹2,490 kurta at 2% that is ₹58.76, not the ₹47.43 a bps of
   net revenue gave (understated ₹11.33 per prepaid order).
5. **Delivered-order ad signals: model 0–2% saving**, not 5%, until a test
   shows more (Meta CAPI 7-day limit; small accounts lack event volume).
6. **RTO**: model Frata's own controls (WhatsApp COD confirmation, pincode
   history, address scoring, prepaid nudge) against the app-stack baseline.
   A cross-brand network is not in the model (ADR-0002, DPDP).
7. **Onboarding is a cost line**: hours per tenant to go live (Meta
   verification, Instagram review up to 4 weeks, Merchant Center), and the
   Tech Provider limit of 10/week before verification.
8. **Pass-through costs stay pass-through**: WhatsApp messages are billed by
   Meta to the merchant (Tech Provider). Model Frata's own Vercel, Supabase and
   support costs per tenant per tier.
9a. **Resold API costs sell at 3× what Frrata pays** (owner, 2026-11-11): anything Frrata buys from an outside API and
   meters to a partner or a brand (model tokens, sandboxes, builds, bandwidth, video minutes when metered) is priced at
   ≥ 3× its cost, rounded up to a clean rupee price, and re-checked whenever the vendor's price or the rupee moves.
   Included allowances inside a seat or plan count at the same rate (the seat's price ≥ 3× the cost of what it
   includes). Pass-through billed by the vendor to the merchant (WhatsApp by Meta) is not resold and stays outside it.
9. **Revenue lines not yet modelled**: Razorpay Aggregator commission (rates
   unpublished — ask), shipping margin if Frata ever resells freight (decision needed).

## Offers (unit-economics-reviewer, 2026-11-08; hypotheses)

- **The fee base is after the discount** (owner call 5): `merchandise_net` is the lines' taxable
  value after offers. Frrata gives up 2% of a discount on Launch (₹2.40 on a ₹1,200 order at 10% off).
- **Offers are core** (every plan): Shopify includes discounts on every plan and GoKwik's fee
  includes prepaid incentives, so an add-on would make Frrata dearer than the baseline.
- **"Pay online, save ₹50"** costs ₹45 on every prepaid order (including those that would have paid
  anyway) and gains ₹215–345 per order that switches from COD. Break-even: 4–8 more prepaid orders in
  100 at 30–40% prepaid and 21–30% COD RTO; about 23 in 100 if switchers are low-risk (10% RTO).
  Test: a 4-week 50/50 split in 2–3 design-partner shops, judged at the shop's own COD RTO.
- **A blanket % off** above a minimum most orders already meet is a giveaway (a ₹2,490 order at 10%
  off keeps ₹235 less and needs 1.3× the delivered orders): the console warns ("62% already qualify").

## Trials (unit-economics-reviewer, 2026-11-08; owner calls the same day; hypotheses)

- **Only the plan's monthly price is free in a trial**; fees and add-ons are charged as usual (owner). Nothing is
  debited during a trial; fee invoices can be paid with Pay now; autopay is asked for once trial fees pass ₹2,000 before
  GST (the grace then starts early). Length: 7–45 days for sign-ups (default 30), up to 90 per shop by staff.
- **Hypotheses, each with its test:**
  - Trial → paid 25% (10–15% fallback) — TR3 weekly cohorts, three of them.
  - Non-payers ≈ 35% − conversion, at ~40 delivered orders a month — delivered orders per paused shop, first 3 cohorts.
  - Paused shops pay ~0% of what they were invoiced — paused shops' invoices paid within 90 days.
  - Cash cost ₹1,050–1,633 per trial (₹1,000 of it an onboarding placeholder) — onboarding minutes, first 20 trials.
  - Forgone revenue per converted shop at 25%: Launch 30 d ₹6,172 (1.8 months), Growth 30 d ₹10,076 (0.5 months).
  - 90 days converts no better than 30 — alternate the setting by weekly cohort; judge on contribution per sign-up.
  - GST on an invoice never paid cannot be recovered — a CA's written opinion.
  - The first debit after a trial fails more above ₹15,000 — debit success by amount band.
- **No credit for plan days already billed in advance** when Admin gives a live, paid shop a trial mid-month or extends
  after a 1st was invoiced: the trial's effect starts with the next invoice (impact review TR0; revisit if a shop asks).

## The pricing ladder (owner-approved 2026-11-11; `docs/specs/2026-11-11-pricing-ladder.md`)

Every feature or add-on is placed and priced by these five steps before it is planned:
1. **Place it:** Core (every plan; needed to run a shop, or the Shopify + India app baseline gives it free) · Metered
   (every plan, a monthly allowance rising by plan, then a prepaid wallet; never a hard stop on selling) · Earns its plan
   (Growth or Scale: pays only past that plan's break-even) · Add-on (a specialist job, monthly price, any plan unless it
   empties a plan).
2. **Check the three stores** — low AOV (₹599 × 300), high AOV (₹4,500 × 80), volume (₹900 × 3,000): what each pays and
   saves from its own orders; an add-on above 2% of a low-AOV shop's GMV is priced again.
3. **Check the baseline** (rule 2): never dearer for the shop the job is for.
4. **Write the nudge:** after a win, never mid-task, in the shop's own rupees, one action, GST shown. A nudge reads
   ISSUED invoices, never a recomputed bill (Apps A2, `cheapestPlan` in `src/domains/billing/ladder.ts`): Launch at its
   list price on the last TWO invoices, no change line, the stored per-order bases at each plan's bps (credits restated),
   the cheapest of Growth and Scale, ≥ ₹500 before GST on both (a festive month alone never triggers it). A move up
   from it writes `billing.plan.source` {source: featured}.
5. **Write the hypotheses** (rule 1).

**The cheapest plan follows delivered GMV, not orders:** Launch → Growth at ₹3.5 L a month, Growth → Scale at ₹20 L.
A ₹4,500-AOV shop at 80 orders is already better on Growth; a ₹599-AOV shop at 300 orders is right on Launch. Low-AOV
shops move up for tools that save ₹ per order (RTO Shield, COD confirm, cart flows); high-AOV shops for the fee and for
keeping big buyers; volume shops for operations (seats, bulk, caps, support).

**Indian merchant psychology (hypotheses, each tested before called right):** value in rupees from their own orders;
usage as prepaid recharges with visibly better big packs; ₹299 / ₹499 / ₹999 and "₹N a day"; no surprise at the bill
(+ 18% GST, only on delivered orders, UPI Autopay notice); trials for add-ons; allowances that turn amber at 80% and
offer wait / recharge / move up, never a wall; yearly ("2 months free") on Growth and Scale only; one recommended plan
labelled by who it is for; no dark patterns (CCPA 2023). Never a one-time activation fee.

**Email marketing as placed (parked by the owner 2026-11-11):** Launch included at ₹0 with 5,000 emails; Growth adds
Pay online next time, Win-back, cart flows, resend, best time, calendar; Scale adds VIP segments, several senders,
higher caps, review of big sends, export/API.

**The plan nudge's hypotheses (unit-economics review 2026-11-11):**

| Figure | Source · date | Test |
|---|---|---|
| A Launch shop ≥ ₹4 L base two months running stays ≥ ₹3.5 L next month | review · 2026-11-11 | backtest over issued `frrata_invoice_fees` |
| A ₹ nudge converts better than a feature list | assumption · 2026-11-11 | a 50% holdout if the owner approves; until then `billing.plan.source` upgrades per eligible shop, 30 days |
| An upgrade from the card is not undone within 60 days | pricing-ladder spec · 2026-11-11 | downgrades within 60 days of a `source: featured` change |
| Frrata gives up ₹500–₹26,500 a month per shop that moves up from the card | review · 2026-11-11 | invoices before and after, per moved shop |

## Current model (founder's, unvalidated, 2026-11)

| Figure | Value | Test |
|---|---|---|
| Contribution per ₹100, Shopify-style stack | ₹6.0 | Rebuild against Shopify + app stack with 3 real merchants' P&L |
| Contribution per ₹100, Frata | ₹10.3 | Same 3 merchants, 60 days on Frata |
| RTO | 21% → 16.5% | Cohort of COD orders, same pincodes, before/after |
| Ad cost saving | 5% (challenge: 0–2%) | A/B ad sets optimising Purchase vs Delivered, 4 weeks |
| Fixed costs | ₹17 L/month placeholder | Itemise: people, infra, support, compliance |
| Break-even | ~471 tenants | Recompute from tier mix and delivered-order fee |
| Funding need | ~₹3.15 cr | Recompute after the above |
| EkCode codes per order (until P2's remembered phone) | 0.6–1.5 (review 2026-11-09) | Delivered `ekcode_codes` ÷ orders, 3 design partners, 4 weeks |
| EkCode order-update opt-in | 30–60% (review 2026-11-09) | `customer_consents` (sender ekcode) ÷ EkCode orders |
| EkCode cost to Frrata a month, Launch / Growth / Scale | ₹42.50 / ₹425 / ₹1,417 expected; worst ₹67 / ₹673 / ₹2,243 (ex GST) | Admin › EkCode cost, month 1 |
| Checkout lift that pays EkCode back | ≥ 2.1% / 3.0% / 4.6% | The pooled holdout (1 in 10), stop at ±2 points at 95% |
| Checked-phone COD RTO | 1 point lower (hypothesis) | Checked vs unchecked COD, same pincodes |
| GST on Meta's invoice recoverable | **Yes (owner, 2026-11-09)**: EkCode costs are ex GST | Confirm on the first invoice's issuer |
| Break-even with EkCode | ~471 → 513–541 tenants | Recompute when 471 is rebuilt |

Partner share (owner, 2026-11-07; unit-economics review 2026-11-07) — a cut of Frata's
COLLECTED revenue (plan fee + delivered-order fee, ex GST, net of refunds), not of
order profit; zero in a month Frata collects nothing:

| Figure | Value | Source · date | Test |
|---|---|---|---|
| Partner share | 20% for 24 months from first opening; 90 days after removal | owner · 2026-11-07 | 5 design partners: do they sign at 20%? |
| Share per Launch / Growth / Scale store | ₹704.80 / ₹3,879.80 / ₹9,299.80 a month | review, illustrative shapes · 2026-11-07 | Phase 6 invoices of partner-built stores |
| Partner-sourced share of new stores | 30% | assumption · 2026-11-07 | partner_links count over 6 months |
| Break-even at 30% partner-sourced, 60/30/10 mix | ~596 tenants (from ~471) | review · 2026-11-07 | recompute when the 471 is rebuilt |
| A Launch store's full 24-month share as acquisition cost | ₹16,915.20 | review · 2026-11-07 | onboarding hours, partner vs direct |
| Partner stores are new, not re-attributed | assumption · 2026-11-07 | opened-to-first-order time vs direct |

Snapshotting 2000 bps per link locks every store opened before contribution is
measured; changing PARTNER_TERMS changes only later stores.

Tiers (decided): Launch ₹1,499/mo (~150 orders) + 2% of delivered order value,
Growth ₹4,999/mo (~1,500) + 1%, Scale ₹14,999/mo (~5,000) + 0.5%; all channels
in every tier; RTO Shield, size/fit and cart flows from Growth. Past the
included orders the store keeps selling and is flagged.
