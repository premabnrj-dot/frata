# PIN code delivery — proposal
Status: active (owner calls 2026-11-12 below; mockup next) · Date: 2026-11-12 · Asked by the owner: "we need a PIN code based system,
delivery system before we plan [True Profit] more effectively … what should we call it, what all are the features"
Research: code map (Explore, 2026-11-12) and market/API facts in `frata-integrations` § PIN code delivery and
§ Shiprocket (integration-researcher, 2026-11-12). Mockup: after the owner picks the name and the scope.

## Goal
Ranked problems 1 (COD/RTO losses) and 4 (mobile checkout conversion): a shopper knows on the product page whether
the brand delivers to their PIN code, by when, and whether COD is there; the brand decides per place what delivery
costs, how long it takes and where COD is allowed, so COD stops going where it always comes back. Measures: RTO rate
on COD (before/after, same pincodes); product-page → checkout rate where the check is used; orders lost to
"not serviceable" at checkout (should fall to near zero).

## What exists today (code map, 2026-11-12)
- `pincodes` table (pincode, city, district, state) — **empty in production**: its loader was never written. Address
  autofill and the risk rule "city is not the pincode's city" silently do nothing.
- Checkout: one flat delivery charge + a free-shipping threshold; COD by value (min/max), a COD fee, and a hand-typed
  list of up to 500 pincodes with no COD. No serviceability, no zones.
- Delivery estimate: "dispatch + metro days / rest days" — but nothing defines which pincodes are metro.
- Returns by pincode: counts in Analytics; ₹ kept by pincode is True Profit's (approved, on hold).
- Ship (Shiprocket) is parked (owner, 2026-11-08); RTO Shield (WhatsApp COD confirmation) is not built.

## The name
Frrata names apps by the job, plainly (Messages, Ship, GST, True Profit). Options:
- **Delivery Zones** (recommended) — says what the merchant sets up: places, and what each one gets.
- Pincode Rules — exact, but sounds like a settings page.
- Delivery Promise — what the shopper sees; undersells the COD rules.

## The features
### In every plan (the floor; the law and the shopper's first question)
1. **The India Post directory loaded** (157,087 rows, GODL-India; a loader script, refreshed monthly). Fixes address
   autofill and the city-mismatch risk rule today.
2. **"Check your PIN code" on the product page**: "Delivers to 302012 by Fri, 21 Nov · Pay on delivery available",
   from the shop's own settings. The page stays cached; the check is one small call that returns only deliverable /
   COD / a date (never a cost: ADR-0003).
3. **Delivery charge and COD fee shown before checkout** (E-Commerce Rules r.7(1)(e); in force more strictly from
   1 Jan 2027; Zepto was fined ₹7 lakh for a charge added at checkout).
4. Today's COD-blocked list keeps working.

### Delivery Zones (the add-on)
1. **Zones, filled in for you**: Metro, Tier 2, Rest of India, Special (North East, J&K, Ladakh, islands), from the
   directory and a metro list; plus the brand's own zones (a list of PIN codes or a prefix like 110…).
2. **Per zone**: delivery charge, free-delivery threshold, delivery days, COD on/off, COD fee, COD order limit.
3. **Per PIN code rules**: don't deliver; prepaid only; COD only above/below an amount. CSV in and out.
4. **Delivery date that holds**: dispatch days, a daily dispatch cutoff ("orders by 2 pm ship today"), shop holidays
   and courier blackout dates; the date shown on the product page, cart, checkout, the order page and order emails.
   No countdown timer (false urgency under the CCPA guidelines).
5. **"Make it prepaid-only" suggestions** from the shop's own returns: PIN codes where COD loses money past the shop's
   break-even (True Profit's rule) — one click turns them prepaid-only. This is True Profit's missing action.
6. **By zone**: orders, COD share, RTO rate and ₹ kept per zone (shares True Profit's engine; no second copy).

### Later, with Ship (Shiprocket) — when the owner unparks it
7. **Courier serviceability**: PIN codes no courier serves are blocked at checkout; dates from the couriers' own
   estimates. Read per shop into a pincode table refreshed through the outbox (Shiprocket allows ~180 calls a window;
   never a live call per shopper). Couriers' costs never leave the server.
8. **Sync the "don't deliver" list** to Shiprocket's blocked-pincode list.

## Where it sits (pricing — unit-economics review before the plan)
Competitors: GoKwik ₹3,000/month + 3.5% on COD (its Shopify app: $35 + 3.5%) with unlimited COD-by-pincode blocking;
Razorpay Magic Checkout (COD only to listed ZIPs, COD fee slabs, a delivery timeline; price unpublished); Pindrop
$0–9.99/month (zones, COD rules, dates); Fastrr Smart EDD $2.99–199.99/month by volume. Options:
- **Recommended:** the floor in every plan; Delivery Zones in Growth and Scale (it saves ₹ per COD order, the
  pricing ladder's reason to move up), and an add-on on Launch at ₹499/month + GST with a 14-day trial (A3).
- Or an add-on on every plan, Scale including it (as True Profit).

## Phases (each its own mockup, plan and reviews)
- **PD·0 — the floor:** load the directory; the product-page check from today's settings; charges before checkout.
- **PD·1 — Delivery Zones:** zones, rules, CSV, the delivery date, holidays.
- **PD·2 — with True Profit:** prepaid-only suggestions and the by-zone numbers (True Profit TP·1 + A3 resume here).
- **PD·3 — with Ship S·1:** courier serviceability and the Shiprocket block-list sync.

## Out of scope (and what brings it back)
- Partial COD (an advance online, the rest on delivery) — the shop's own Razorpay could take it; a separate decision.
- Hyperlocal / same-day delivery — a brand with its own riders asks.
- WhatsApp COD confirmation — RTO Shield.
- Weight- or size-based delivery charges — Ship's rates.

## Facts used
`frata-integrations` § PIN code delivery and § Shiprocket (2026-11-12): Shiprocket serviceability fields, block-list
API and rate limit [P/U]; GoKwik, Razorpay, Pindrop, Fastrr prices and features [V-undated]/[V]; India Post directory
[S, datahub.io mirror 2026-10-03]; RTO by tier [S, ClickPost 2026-11-09]; e-commerce rules [S]/[V gazette].

## Owner calls (2026-11-12)
- **Name: Delivery Zones.**
- **Placement:** included in Growth and Scale (a plan feature, the pricing ladder's reason to move up); on Launch an
  add-on at ₹499/month + GST with a 14-day trial (A3) — as proposed; the unit-economics review checks the ₹499.
- **Ship stays parked:** PD·0–PD·2 run on the brand's own settings; PD·3 waits for Ship.
- **Split with the other session** (Admin/console UX, branch `claude/elegant-carson-8jygm1`): it owns loading the India
  Post directory into `pincodes` (`scripts/ops/pincodes-sql.mjs`, b16baed) with the CSV the owner has; this plan owns
  everything built on it. Note sent to that session 2026-11-12.
