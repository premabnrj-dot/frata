# Phase 1 — First sale
Status: draft · Date: 2026-11-06 · Mockup: https://claude.ai/artifact/NvAiqDdfikTq97hFtUfFYX · Approved: pending

## Goal
Ranked problems 3 (catalogue ops), 4 (mobile checkout), 5 (premium storefront).
Measures: first product live in under 15 minutes from sign-up; the first real order.

## Job
A brand owner with no developer puts their fashion range online and takes COD and
prepaid orders from phones, then confirms each order from one queue.

## Research (2026-11-06)
- **Baymard, apparel sizing (2022):** 83% desktop / 87% mobile lack sufficient
  sizing info; 10 practices. Taken: chart per product type, cm and inches, how to
  measure, model's height and size, guide link beside sizes, Back closes it.
- **Baymard, 5 apparel practices (2022, updated 2025-02-25):** 70% hide sizes in a
  drop-down; 21% no human model; 24% no fit subscore; 90% no cross-review photos.
  Taken: size buttons with sold-out; on-model cover required. Fit score → Phase 4.
- **Shopify variant redesign (2026-10-28, rollout Dec 2026):** options first,
  variants on the product page, grouped/filtered pane, table view, bulk edit.
  Taken: options → size × colour grid grouped by colour, "set every price".
- **India D2C checkout (2026, vendor sources — direction only):** COD availability
  per pincode must show before the bag; pincode fills city/state; < 8 fields;
  75–85% mobile. Taken: PDP pincode check; 7-field one-page checkout.
- **COD confirmation (vendor sources):** confirm within 5 minutes; claimed RTO
  cuts disagree (15–45%). Taken: "To confirm" queue now; automation Phase 2.
- **Norman:** constraints over refusals, recognition over recall, feedback, defaults.

## Design
Nine artboards in the mockup: overview; console Home (setup checklist), product
editor, orders queue, orders on a phone; shop home, product page, size guide sheet,
checkout (phone).

## Owner calls (recommendations in the mockup)
1. Shop domain for subdomains. 2. Merchant's own Razorpay keys in Phase 1.
3. COD rules: on, max order value, blocked pincodes. 4. Order page + WhatsApp link,
no SMS/API messaging. 5. One theme with brand logo, colours, two fonts.

## Out of scope (and what brings each back)
Automatic WhatsApp, shipping (Phase 2) · profit per order (Phase 3) · returns,
reviews, fit (Phase 4) · coupons (a merchant asks twice) · Instagram (Phase 5) ·
own domains, billing (Phase 6).

## Design review
Written after sign-off, with the plan, and run past `architecture-reviewer`,
`tenancy-auditor` and `unit-economics-reviewer` before any code (`frata-planning`
rule 3). Known areas: new tenant tables (products, variants, size charts, carts,
customers, addresses, settings) each with RLS; encrypted per-tenant Razorpay keys;
storefront caching keyed by host; stock decrement race safety at checkout; image
storage and bandwidth; pincode → city/state data source.

## Facts used
Third-party facts above with their source dates; integration facts in
`frata-integrations` (checked 2026-11-06).
