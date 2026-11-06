# Phase 1 — First sale
Status: draft v2 · Date: 2026-11-06 · Prototype: https://claude.ai/artifact/QJ3N5knGqGZniMCsZJn7Fu · Approved: pending
(v1 canvas mockup, superseded: https://claude.ai/artifact/NvAiqDdfikTq97hFtUfFYX)

## Goal
Ranked problems 3 (catalogue ops), 4 (mobile checkout), 5 (premium storefront).
A merchant lists a fashion range and takes its first COD and prepaid orders, from
phones, in an afternoon.

| Measure | Target |
|---|---|
| Sign-up to first product live | ≤ 15 min |
| Fields to place an order | ≤ 7 |
| Product page LCP, mid Android on 4G | < 2.0 s |
| Orders lost or charged twice in the stress tests | 0 |

## Build order (each usable alone; each ends with tests, a production build and the live logs)
- **1A Catalogue and look** — products, options, variant grid, size charts by type, photos, theme. The shop can be previewed.
- **1B Storefront** — home, collection, product page, size guide, pincode check, bag. Edge-cached; stock checked live.
- **1C Checkout and payments** — one-page checkout, COD rules, Razorpay with the merchant's keys, webhook, order page, merchant email.
- **1D Orders** — work queue, confirm/cancel with undo, stock back on cancel, repeat-COD flags.

## Modules — research, build, stress test

### 1A·1 Store setup and look
- Research: a setup checklist on Home (recognised, not a trapping wizard); Publish off until a product exists, reason in words (Norman).
- Build: checklist **derived from data**, never a stored "done" flag. Theme = logo, accent, display font; buttons stay ink. Changing the shop address keeps the old subdomain 301-redirecting for 30 days.
- Stress: address changed after links shared → old host redirects, Admin shows both · 12 MB logo → refused over 2 MB with the reason, PNG/SVG only · accent fails contrast → accent only on small marks, never text or buttons.

### 1A·2 Catalogue
- Research: Shopify variant redesign (2026-10-28): options first, variants on the product page, grouped, bulk-edited. Baymard sizing: a chart per product type in cm and inches, how to measure, the model's height and size.
- Build: variants generated from options, grouped by colour, collapsed past 12 rows; "set every price"; size chart owned by the product type (count of products shown); photos resized once at upload to 400/800/1600 px AVIF+WebP (no per-view transforms billed); a variant with orders is archived, never deleted — orders snapshot name, size, price.
- Stress: 6 × 8 = 48 variants → grouped, one transaction · two editors → save checks the loaded version, the second sees both, never a silent overwrite · 20 MB photo on slow network → resized in the browser (≤ 3 MB sent), progress, form usable · removing a size with open orders → refused with order numbers.

### 1B Storefront
- Research: Baymard — 70% hide sizes in a drop-down; sizes are buttons with sold-out shown. India D2C — COD at my pincode is the first question; answer on the product page. CWV good = LCP 2.5 s, INP 200 ms, CLS 0.1.
- Build: server-rendered, edge-cached per host, cache tags per product. Stock re-checked at add-to-bag and checkout. Pincode → city/state from the Department of Posts directory (Open Government Data Licence) loaded into our DB; delivery days per region set by the merchant until Shiprocket (Phase 2). Size guide is a sheet; Back closes it; focus returns.
- Stress: festive 10× → pages from the edge, DB sees only bag/checkout · last unit sells while cached → "Just sold out in M" with sizes left · unknown pincode → city typed, order flagged · slow 3G → complete HTML, reserved photo boxes, no skeletons.

### 1C Checkout and payments
- Research: Baymard — 7–8 fields is the floor, labels above. Razorpay — create the order server-side, verify the signature against **our** order id, fulfil on `payment.captured`. India — OTP SMS needs DLT; fake-COD defence is layered.
- Build: prices recomputed on the server at every step (browser sends ids and quantities). Placing an order reserves stock in the same transaction (`update … where stock >= qty`); unpaid prepaid reservations expire after 15 min. Idempotency key per checkout attempt. Webhook URL per shop (`/api/webhooks/razorpay/<shop key>`): the tenant comes from the key we issued, never the payload; stored before processed (ADR-0006). Keys encrypted (AES-GCM, server key in Vercel), the secret never returned to a browser.
- Stress: double tap → one order · tab closed after paying → webhook marks paid, order page by its link · webhook before browser → one conditional update, second is a no-op · two shoppers, last M → one wins, other told before paying · price changed → "Price updated to ₹2,690" before payment · scripted fake COD → per-IP/per-phone limits, repeat flag, never bulk-confirmed · wrong keys → "Test and connect" refuses before saving.

### 1D Orders
- Research: COD confirmation within minutes cuts returns (vendor claims 15–45%, unverified); the queue is the manual version until WhatsApp (Phase 2). Optimistic updates (React 19 `useOptimistic`).
- Build: state from timestamps, no status column. Confirm is conditional (`where confirmed_at is null`); the loser sees "Already confirmed by …". Undo (5 s) is a real reversal through the same action, audited. Cancel takes a reason and returns stock in the same transaction. Bulk confirm skips flagged orders and says how many.
- Stress: 300 to confirm → j/k/c keys, 50 a page, bulk for unflagged · confirmed by mistake → Undo, then Cancel · support visit → audit row with both names (`asMember`) · cancelled stock → back on sale, cache tag refreshed.

### 1C·N Telling people
- Shopper: order page at an unguessable link (128-bit token) and a WhatsApp click-to-chat link to the brand. Merchant: new-order email from the outbox after commit, retried with backoff. SMS and WhatsApp API messages: Phase 2.

## Speed budgets (production build, throttled mid Android; over budget → split, never raise)
| Surface | Budget |
|---|---|
| Product page LCP | < 2.0 s (cover photo is the LCP element, preloaded, sized to the phone) |
| INP | < 200 ms (size/colour local state; Add to bag optimistic) |
| CLS | < 0.1 (reserved aspect boxes; fallback font metrics) |
| Shop JS first load | ≤ 90 kB gzipped (server components; bag and checkout the only islands; Razorpay script on Pay) |
| Console list pages | < 1 s broadband (one query, 50 rows, indexed filters) |
| Cover photo | ≤ 150 kB at 800 px |

## Motion
120 ms feedback · 200 ms small moves and exits · 320 ms screens and sheets entering · nothing over 400 ms · lists never animate on load · reduced motion = instant · CSS transitions only (View Transitions are experimental in Next.js: enhancement, never required). A screen slides from the side it came from; the bag count bumps; a confirmed order slides out with Undo; autofilled fields flash once.

## Owner calls (recommendations in the prototype)
1. **Shop domain** — one short domain for every shop's subdomain, on Vercel nameservers; needed before 1B goes live.
2. **Prepaid** — each merchant's own Razorpay keys, encrypted, until the partner application is approved.
3. **COD rules** — on by default, max order value (₹3,000 suggested), blocked pincodes, flag > 2 COD orders per phone per day.
4. **No shopper OTP yet** — start DLT registration now; OTP for COD in Phase 2.
5. **Notifications** — order page + WhatsApp link for the shopper; new-order email for the merchant (one new dependency: an email service).
6. **One theme** — logo, accent colour, display font.
7. **Paid plans before a real sale** — Vercel Hobby is non-commercial; free Supabase pauses and has no backups → Vercel Pro and Supabase Pro.

## Out of scope (and what brings each back)
Automatic WhatsApp, shipping (Phase 2) · profit per order (Phase 3) · returns,
reviews, fit (Phase 4) · coupons (a merchant asks twice) · Instagram (Phase 5) ·
own domains, billing (Phase 6).

## Design review
Written after sign-off, with the plan, and run past `architecture-reviewer`,
`tenancy-auditor` and `unit-economics-reviewer` before any code (`frata-planning`).
Known areas: new tenant tables (products, variants, size charts, carts, customers,
addresses, settings, pincodes as shared reference data) each with RLS; encrypted
per-tenant Razorpay keys; the per-shop webhook key; storefront caching keyed by
host; stock reservation races; image storage and bandwidth.

## Sources (checked 2026-11-06)
Baymard (apparel sizing; 5 apparel practices; checkout and mobile forms) · Shopify
variant editor redesign (2026-10-28) · Razorpay Standard Checkout best practices and
integration · Department of Posts All India Pincode Directory (OGD licence) · DLT
OTP registration (vendor guide) · COD verification (vendor sources, unverified) ·
Next.js View Transitions (experimental) · Vercel image optimisation pricing.
Integration facts: `frata-integrations`.
