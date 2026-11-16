# unit-economics-reviewer 1.1.0 — profit-without-freight

**Query:** Review this proposed change for what it does to profit per order and the business model. Return findings with rupee figures where you can.

## Answer

**Verdict:** HURTS the merchant. For Frrata it is NEUTRAL on revenue and HURTS on the model's credibility. I did not run the engine. This session has no shell or write tool, so I couldn't create and run `model.scratch.test.ts`. Every figure below is hand-derived from the skill's dated rates and is a lower bound. Re-run it through `orderProfit` before relying on it. The three shapes are illustrative, not data.

**What the change moves**

It adds no price and no fee. It re-implements profit as `price − cogs − fee`, which `profit.ts` and CLAUDE.md forbid ("nobody computes a margin inline"). Against `orderProfit` (`profit.ts:52-67`) it drops:
- forward freight
- packaging
- ad cost
- the courier's COD fee
- the gateway fee (`gatewayFee`)
- the whole `ifRto` and `ifLost` branches
- `restocked`
- the delivery-probability weighting behind `expected`

Three consequences:
- **Returns:** a returned COD order shows a profit when the engine says it is a loss.
- **Frrata's fee:** if `feePaise` is Frrata's fee, a returned order is shown paying it. Frrata bills nothing on returns.
- **Display:** `Number(profit)/100` and `toFixed(2)` are float rupees (ADR-0004). It should use `<Money>` and `src/lib/format.ts`.

The `bigint` props also don't match `orderProfit`'s `Paise` number type. If this file ever becomes a client component, `cogsPaise` would reach the browser (ADR-0003).

**Overstatement per month, lower bound (gateway fee and reverse pickup only)**

Inputs from the skill: gateway fee is 2% plus 18% GST on prepaid orders. Reverse pickup is ~₹70 per return, and I treat it as the only RTO cost counted. Prepaid share is 100% minus the COD share. RTO applies to COD orders.

| Shape | Orders · AOV | Prepaid orders × gateway fee | Returns × ₹70 | Profit shown too high by (≥) |
|---|---|---|---|---|
| Launch | 150 · ₹900 | 45 × ₹21.24 = ₹955.80 | 26.25 × ₹70 = ₹1,837.50 | ₹2,793.30 |
| Growth | 1,500 · ₹1,200 | 600 × ₹28.32 = ₹16,992.00 | 180 × ₹70 = ₹12,600.00 | ₹29,592.00 |
| Scale | 5,000 · ₹1,500 | 2,500 × ₹35.40 = ₹88,500.00 | 400 × ₹70 = ₹28,000.00 | ₹116,500.00 |

Forward freight, packaging, ads and the lost forward leg are not counted. Their inputs aren't in the skill, so the real gap is larger. Launch's plan fee is ₹1,499 a month. The Launch gap alone is about 1.9× that.

**Baseline comparison**

Nothing in price or tier changes, so the comparison with Shopify Basic or Grow plus an India checkout app, Shiprocket and a WhatsApp tool does not move. Frrata is no dearer than before. But Frrata's pitch is "profit per order after returns", and this component shows a number the Shopify app stack can't beat because it leaves out the costs that stack makes visible.

**Hypotheses at risk**
- **Contribution per ₹100, ₹10.3 versus ₹6.0:** it can't be tested on the console if the console shows a different formula.
- **RTO 21% → 16.5%:** a returned COD order shows as profit, so the benefit would not appear.
- **H-TP2** (True Profit at ₹999 a month): merchants won't pay for ₹ kept if the order row disagrees with it.

**Cheapest test**

Add a vitest case that renders the row for one fixture per shape and asserts the shown rupees equal `orderProfit(...).expected / 100`. It fails on this diff. The fix is to pass in a server-computed value from `orderProfit` and format it with `<Money>`, with no arithmetic in the component. That fix also keeps costs off the client.

**Accepted (docs/decisions/accepted-findings.md)**

None. Rows 1–4 (Vercel token, offer use limit, pre-bash hook, Console page budgets) don't match this change.

## Expected

- Flags that profit per order is computed here instead of read from src/domains/orders/profit.ts (a second copy)
- Flags that freight, payment fees and RTO cost are missing, so profit is overstated on COD orders
- Flags that money is formatted by hand instead of <Money> / src/lib/format.ts
- Gives a rupee example of the overstatement on an order

## Verdict

MET: Flags that profit per order is computed here instead of read from src/domains/orders/profit.ts (a second copy)
MET: Flags that freight, payment fees and RTO cost are missing, so profit is overstated on COD orders
MET: Flags that money is formatted by hand instead of <Money> / src/lib/format.ts
MET: Gives a rupee example of the overstatement on an order
