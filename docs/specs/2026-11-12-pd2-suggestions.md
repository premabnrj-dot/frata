# Delivery Zones PD·2 — suggested rules and numbers by zone
Status: parked (owner, 2026-11-12: "keep it parked, will pick up later") · Date: 2026-11-12 · Mockup: https://claude.ai/artifact/3A2V4tn9BpMWkww43xh9pR ·
Approved: — (awaiting the owner)

## Goal
Ranked problem 1 (COD/RTO losses): a brand turns pay on delivery off where it loses money, from its own orders, in one
click. Measure: suggestions accepted within 30 days; COD ₹ kept at those PIN codes over the next 30 days.

## Job
A brand with Delivery Zones sees which PIN codes and zones lose money on pay on delivery, and makes them pay online.

## Research
- GoKwik RTO Predict: blocks COD by risk score, a black box (Taken: the brand decides, the reason is shown).
- Shiprocket: pincode-level RTO reports, no action from them (Taken: the action sits next to the number).
- True Profit (ours, 2026-11-12): "COD loses money" = COD ₹ kept < 0 over ≥ 5 COD orders, 90 days (Taken: the same rule).

## Design (mockup)
- PIN code rules: "Suggested" above the rules; each row PIN code, place, COD orders, came back, COD and prepaid ₹ kept,
  **Pay online only** (adds the rule with its numbers as the reason) and **Not now** (hidden 30 days).
- Zones: Orders · 90 days, Came back, ₹ kept per order; a zone whose COD loses money gets "Make <zone> pay online only".
- Staff see counts without ₹; the accountant doesn't see Delivery Zones.

## Design review (first pass; agents run on the plan after sign-off)
- **Tenancy:** one new table (dismissals: tenant_id, pincode or zone, until) with grant, RLS and policy; reads through
  `withTenant`; costs through `costsVisibleIn`.
- **SSOT:** the rule and the figures come from `src/lib/queries/true-profit.ts` (keptOf); zones from `zoneFor`.
- **Speed:** cached 15 minutes per shop, as True Profit.
- **Unit economics:** no price change; the suggestion moves COD orders to prepaid at those PIN codes (hypothesis H-TP4).

## Out of scope
- Suggesting "Don't deliver" (needs courier serviceability: PD·3 with Ship).
- Automatic rules.
