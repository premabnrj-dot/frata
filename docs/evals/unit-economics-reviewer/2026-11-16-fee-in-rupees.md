# unit-economics-reviewer 1.1.0 — fee-in-rupees

**Query:** Review this proposed change for what it does to merchant profit, Frrata revenue and the money rules. Return findings with rupee figures where you can.

## Answer

## Verdict

- **Merchant: HURTS.**
- **Frrata: HURTS.** Fee revenue rises at once, but only by overturning an owner decision, and the price would sit well above the Shopify baseline.

**Limit on these figures:** this session has no Write or Bash tool, so I could not run the scratch test against `orderProfit`. The figures below are hand arithmetic on the fee line only, not engine output. This change never touches `orderProfit` (`platformFee` is still an input), so the fee line is the only figure that moves. Please re-run it with the engine before anyone quotes these numbers.

The three shapes are illustrative, not data. I assumed RTO applies to COD orders only, and that the order value is ₹ ex GST and shipping. All figures are ₹ per month, ex GST.

## Findings

1. **It charges on placed orders, not delivered ones.** This contradicts rule 4 (owner, 2026-11-06): "A returned COD parcel costs the merchant nothing from Frata". It also contradicts the lost-parcel rule (`ifLost`: a lost parcel is never billed) and the 2026-11-12 ruling that a returned item isn't billable. A merchant would pay 2% on every RTO'd parcel.
2. **It uses a flat 2% for every tier.** The decided rates are 2% / 1% / 0.5%, stored as bps on the plan version and applied through `feeForOrder`. A hardcoded 0.02 bypasses that. Growth and Scale would pay 2× and 4× their rate.
3. **The wrong base.** `totalRupees` presumably includes GST, shipping and the COD fee. The base must be `merchandise_net` (review 2026-11-07).
4. **It breaks ADR-0004.** It uses float rupees, `Math.round(x*0.02*100)/100` instead of `applyBps` on paise, and a `numeric(10,2)` column instead of a `bigint` paise column.
5. **It duplicates a derived fact.** The fee is already derived (billing's `feeForOrder`, `frrata_fee_credits`). A stored `orders.frata_fee_rupees` would be a second copy, and it would ignore return credits.
6. **Possible cost leak.** This is a Frrata fee column on `orders`, so ADR-0003 and `check-client-bundle` apply. Also check that migration number 0151 doesn't collide (`npm run release:check`).

## Tables

| Shape | Inputs | Delivered | Fee now → proposed | Δ |
|---|---|---|---|---|
| **Launch** | 150 orders, ₹900, 70% COD, 25% RTO | 123.75 | 2% × 900 × 123.75 = ₹2,227.50 → 2% × 900 × 150 = ₹2,700.00 | +₹472.50 (+21%) |
| **Growth** | 1,500 orders, ₹1,200, 60% COD, 20% RTO | 1,320 | 1% × 1,200 × 1,320 = ₹15,840 → 2% × 1,200 × 1,500 = ₹36,000 | +₹20,160 (2.3×) |
| **Scale** | 5,000 orders, ₹1,500, 50% COD, 16% RTO | 4,600 | 0.5% × 1,500 × 4,600 = ₹34,500 → 2% × 1,500 × 5,000 = ₹150,000 | +₹115,500 (4.3×) |

Total monthly bill (plan + fee) against Shopify. Shopify's side is its plan price plus the gateway fee on prepaid orders only, with COD exempt. I did not add the checkout app, Shiprocket or WhatsApp tool, because the skill has no dated prices for them.

| Shape | Frrata now | Frrata proposed | Shopify plan + gateway fee |
|---|---|---|---|
| **Launch** | 1,499 + 2,227.50 = ₹3,726.50 | 1,499 + 2,700 = **₹4,199** | Basic 1,994 + 2% × 45 × 900 (810) = ₹2,804 |
| **Growth** | 4,999 + 15,840 = ₹20,839 | 4,999 + 36,000 = **₹40,999** | Grow 7,447 + 1% × 720,000 (7,200) = ₹14,647 |
| **Scale** | 14,999 + 34,500 = ₹49,499 | 14,999 + 150,000 = **₹164,999** | Advanced 30,164 + 0.6% × 3,750,000 (22,500) = ₹52,664 |

Frrata is already dearer than Shopify on Launch and Growth before this change. Proposed, it is dearer at every shape: 1.5× at Launch, 2.8× at Growth and 3.1× at Scale, all before app-stack costs. The bundle would have to be worth about ₹1,395, ₹26,352 and ₹112,335 a month more than Shopify, and that gap is more than any bundle claim in the skill supports.

## Hypotheses at risk

- Merchants accept a fee on orders that never delivered. Rule 4 rests on the opposite, and so does the "costs nothing if returned" pitch.
- The bundle carries the premium over Shopify and the app stack. Nothing in the model supports an extra premium of this size.
- Break-even of about 471 tenants. Revenue per tenant rises, but churn and the trial → paid rate (25%) would fall. Those hypotheses were never tested at this price.

## Cheapest test

Backtest, no build needed. On issued `frrata_invoice_fees` plus order outcomes, compute each shop's fee on placed orders against delivered orders. Then show the placed-order invoice to the 3 design partners and record whether they sign. That takes a query and three conversations.

## Accepted (docs/decisions/accepted-findings.md)

No finding here matches rows 1–4. They cover the Vercel token, late captures, the pre-bash hook and Console page budgets.

If the aim is more revenue, the cheaper route is the one the skill already allows: change the bps on a new plan version, applied to delivered `merchandise_net`.

## Expected

- Flags that money must be integer paise end to end (bigint columns, src/domains/money/paise.ts), not rupees or numeric/float
- Flags that the fee is charged on orders placed rather than delivered orders, which charges merchants for RTO and cancelled orders
- Flags that storing the fee as a column duplicates a fact that should be derived once
- Gives at least one rupee figure, e.g. what the fee costs a merchant on RTO orders

## Verdict

MET: Flags that money must be integer paise end to end (bigint columns, src/domains/money/paise.ts), not rupees or numeric/float
MET: Flags that the fee is charged on orders placed rather than delivered orders, which charges merchants for RTO and cancelled orders
MET: Flags that storing the fee as a column duplicates a fact that should be derived once
MET: Gives at least one rupee figure, e.g. what the fee costs a merchant on RTO orders
