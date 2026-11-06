---
name: frata-unit-economics
description: Use when setting or changing Frata's pricing tiers, per-order fee, what a tier includes, or when computing profit per order, contribution per ₹100, RTO impact, ad savings, break-even tenants or funding need - to keep every number a dated hypothesis with its test, and to compare against the right baseline.
metadata:
  version: 1.0.0
  verified: 2026-11-06
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
4. **Charge on delivered orders.** A per-order fee on COD orders that return
   makes Frata dearer than Shopify for its own target merchant. Flat ₹ per
   delivered order by tier is the working recommendation (owner to decide).
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

Tiers (decided): Launch ₹1,499/mo (~150 orders), Growth ₹4,999/mo (~1,500),
Scale ₹14,999/mo (~5,000); all channels in every tier; RTO Shield, size/fit
and cart flows from Growth.
