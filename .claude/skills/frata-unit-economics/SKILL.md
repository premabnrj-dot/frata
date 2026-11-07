---
name: frata-unit-economics
description: Use when setting or changing Frata's pricing tiers, per-order fee, what a tier includes, or when computing profit per order, contribution per ₹100, RTO impact, ad savings, break-even tenants or funding need - to keep every number a dated hypothesis with its test, and to compare against the right baseline.
metadata:
  version: 2.3.0
  verified: 2026-11-07
  covers: ["src/domains/orders/profit.ts", "src/domains/money/**"]
---

# Frata unit economics

## The one formula

Profit per order is `orderProfit()` in `src/domains/orders/profit.ts` — if
delivered, if returned, and expected (weighted by delivery probability). The
console, analytics and any model use it; nobody computes a margin inline.
Contribution per ₹100 is `contributionPer100()`. Money in paise.

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
9. **Revenue lines not yet modelled**: Razorpay Aggregator commission (rates
   unpublished — ask), shipping margin if Frata ever resells freight (decision needed).

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
