# Phase 1 — First sale
Status: active (v3) · Date: 2026-11-06 · Prototype: https://claude.ai/artifact/QJ3N5knGqGZniMCsZJn7Fu · Approved: owner, 2026-11-06 ("approved, go with your recommendations")
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
- **1W Website and sign-up** — Frata homepage; email link + 6-digit code; shop name → address; pickup pincode; settings row with defaults.
- **1A Catalogue and import** — products, options, variant grid, size charts by type, photos; CSV import (Shopify format or our template).
- **1S Settings** — store, contact and grievance officer, brand, policies from settings, payments and COD, shipping, taxes and invoices, shop address, team.
- **1B Storefront** — home, collection, product page, size guide, pincode check, bag, policy pages. Edge-cached; stock checked live.
- **1C Checkout and payments** — one-page checkout, COD rules and fee, Razorpay with the merchant's keys, webhook, order page.
- **1D Orders** — work queue and order page: confirm/cancel with undo, risk with reasons, packing slip, invoice or bill of supply.

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
- Shopper: order page at an unguessable link (128-bit token) and a WhatsApp click-to-chat link to the brand. Merchant: new orders appear in the console's "To confirm" count. **No email service in Phase 1** (owner, 2026-11-06: email waits). SMS and WhatsApp API messages: Phase 2.

### 1W Website and sign-up
- Research: NN/g homepage principles (2024-03-15): who you are and what to do at a glance, one primary action, no decorative motion. Shopify India: "Start for free", no card, store behind a password until a plan. Stripe: test mode first, activation later. Appcues case studies (vendor, unverified): one question that changes what the user sees lifts activation; others do not.
- Build: static, server-rendered homepage, every claim marked Now or Next, prices with "+ 18% GST", fee "only on delivered orders". Sign-up = email (link **and** 6-digit code in one email) → shop name (address derived, reserved and taken names refused, unique index) → pickup pincode (city from the Department of Posts directory) → optional "what do you sell" (picks the starting size chart). One transaction creates tenant, owner, settings, domain, Launch plan version, audit row. A side panel says what is not asked now.
- Stress: link opened elsewhere → code · email typo → "Did you mean" · two claims on one address → unique index, alternative offered · Hindi/emoji name → address from typed letters · bot sign-ups → per-IP/email limits, no shop before a confirmed email · email in Promotions → hint, resend after 30 s.

### 1S Settings
- Research: Shopify settings list; Brand assets feed the theme; policies generated from store details; App Bridge save bar (Save / Discard, confirm on leave). Consumer Protection (E-Commerce) Rules 2020 (law-firm summaries, **to confirm with a lawyer**): legal name, address, customer-care contacts, grievance officer (48 h / 1 month), price breakup. CCPA Dark Patterns Guidelines (2023-11-30): no drip pricing → COD fee shown before ordering. Razorpay checks About, Contact, Terms, Privacy, Refund, Shipping before live keys.
- Build: one settings row per tenant (typed columns, RLS), read by storefront, policies, checkout and invoices — no copies. Policies are templates rendered from settings at request time; an edited page stops following and says so. Explicit save per page, one cache tag revalidated. One Zod schema per page in `src/domains/settings/` (GSTIN, mobile, pincode, integer rupees), same on the server. "Ready for live payments" derived, not stored. Razorpay keys stay a connect action.
- Stress: two tabs → version check, both values shown · COD fee raised mid-checkout → server total shown before placing · GSTIN with spaces/lower case → normalised, wrong checksum refused · grievance officer emptied on a live shop → refused · address change → 301 for 30 days · save during a sale → one tag, no rebuild · support edit → audited.

### 1A·3 Import products from a file
- Research: Shopify CSV (help.shopify.com, read 2026-11-06): one row per variant sharing a Handle, extra rows for images; 3 options; 15 MB; 2025 header renames with old names accepted; overwrite clears values on blank cells; no import history. WooCommerce: parent + variation rows. Dukaan: template, review before save.
- Build: file to storage + a job row; a background job parses in chunks of 500. Dry run writes nothing: products, variants, photos, every error by row/column/reason, rows-to-fix download. Per product all-or-nothing. Match by Handle and SKU; update off by default; blank never clears unless asked. Photos via the outbox, resized once; products arrive hidden. File hash → same file twice is a no-op. Cost per item server-only.
- Stress: 20,000 rows → chunked, resumable · same file twice → no-op · Excel encodings/BOM → converted or explained · dead photo URL → product created, photo retried · "Rs 999", "999.999" → row errors, "1,299" accepted · cells starting `=` in rows-to-fix → escaped · fourth option → refused.

### 1D·2 Order detail
- Research: Shopify order page (items as ordered, timeline with notes, contact card, risk as level + next step + indicators). Dukaan: orders wait in Pending. GoKwik/Shopflo RTO scores (vendor, unverified). CGST Rule 46 (gstzen.in copy; confirm with CBIC): series per financial year ≤ 16 chars; no GSTIN → bill of supply, never "tax invoice".
- Build: one primary action per state (Confirm · Print packing slip · none); the rest under More. Risk from rules with plain reasons and a next step, no score. Items read the order's price snapshot. Activity derived from timestamps, notes and audit rows. Address/phone editable until shipped, logged old → new, risk recomputed. Invoice numbers from a per-shop, per-year counter in the invoice's transaction.
- Stress: two confirms at once → one wins · address edit after confirm → logged · price changed after order → order keeps it · 9-digit phone → call/WhatsApp off, high risk · prepaid cancel → stock back, refund in Razorpay until Phase 2 · 31 Mar 23:59 vs 1 Apr 00:01 → two series · long Hindi address at 360 px · support edit → badge in Activity.

### Demo catalogue
No open fashion dataset with on-model photos is cleared for commercial use (Kaggle "Fashion Product Images" = Myntra listings, licence unclear; DeepFashion non-commercial; IndoFashion no licence). Plan: our own CSV of ~20 invented products for tests and the demo tenant; Pexels photos (commercial use, no implied endorsement) on a shop marked "Demo store: not for sale" in test mode; our own small shoot before marketing.

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

## Owner calls — all decided (owner, 2026-11-06: "go with your recommendations")
1. **Shop domain** — direction (owner, 2026-11-06): buy a cheap domain now for every shop's address; switch before the first real merchant. `NEXT_PUBLIC_SHOP_DOMAIN` + new `tenant_domains` rows, old ones redirect.
2. **Prepaid** — each merchant's own Razorpay keys, encrypted, until the partner application is approved.
3. **COD rules** — on by default, lowest/highest order value (₹3,000), blocked pincodes, a COD fee shown as its own line before ordering (₹0 default), flag > 2 COD orders per phone per day.
4. **No shopper OTP yet** — start DLT registration now; OTP for COD in Phase 2.
5. **Notifications** — decided (owner, 2026-11-06): order page + WhatsApp link for the shopper; the merchant sees new orders in the console. No email service yet.
6. **One theme** — logo, accent colour, display font, under Settings → Brand.
7. **Paid plans before a real sale** — Vercel Pro and Supabase Pro.
8. **Sign-up by email link and code** — phone OTP waits for DLT.
9. **Go live on COD before KYC** — prepaid when Razorpay is connected; live keys need the legal details.
10. **Free to build, plan at publish** — no card; "Opening soon" until publish (charging is Phase 6).
11. **Import accepts Shopify's file as it is** — old and new headers; WooCommerce when a merchant asks.
12. **Demo photos** — Pexels in a marked demo shop now; our own shoot before marketing.
13. **One lawyer review** of the policy templates and grievance wording before the first real merchant.

## Out of scope (and what brings each back)
Automatic WhatsApp, shipping (Phase 2) · profit per order (Phase 3) · returns,
reviews, fit (Phase 4) · coupons (a merchant asks twice) · Instagram (Phase 5) ·
own domains, billing (Phase 6).

## Design review
Written after sign-off, with the plan, and run past `architecture-reviewer`,
`tenancy-auditor` and `unit-economics-reviewer` before any code (`frata-planning`).
Known areas: new tenant tables (products, variants, size charts, carts, customers,
addresses, settings, invoice counters, import jobs, pincodes as shared reference data) each with RLS; encrypted
per-tenant Razorpay keys; the per-shop webhook key; storefront caching keyed by
host; stock reservation races; image storage and bandwidth.

## Sources (checked 2026-11-06)
Baymard (apparel sizing; 5 apparel practices; checkout and mobile forms) · Shopify
variant editor redesign (2026-10-28) · Razorpay Standard Checkout best practices and
integration · Department of Posts All India Pincode Directory (OGD licence) · DLT
OTP registration (vendor guide) · COD verification (vendor sources, unverified) ·
Next.js View Transitions (experimental) · Vercel image optimisation pricing.
Integration facts: `frata-integrations`.
