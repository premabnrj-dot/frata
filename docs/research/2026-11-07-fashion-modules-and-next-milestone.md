# Built-in modules for fashion, how to package them, and the next milestone

Status: research + proposal · Date: 2026-11-07 · Approved: pending (owner picks the milestone, § 6)
Sources: dated in place (all checked 2026-11-07; App Store pages carry no date, so the newest review is given).
Shopify app listings are vendor-set prices; India pain-point figures are mostly from logistics vendors (directional).

## 0. Where Frata is today

Built: tenancy, Admin and plans (A1–A2), the UX foundation, catalogue (size × colour, size charts,
availability), the storefront, checkout (COD and Razorpay), orders 1D (queue, risk, confirm, pack,
documents, the order page), and partners. **Not built: anything that leaves the building.** That means
WhatsApp, couriers, Meta and Google signals, returns, and charging merchants. Plans exist and carry a
`features` list (`rto_shield`, `size_fit`, `cart_flows`); nothing reads it yet in the console.

## 1. What Shopify gives, and what a fashion brand still buys

**Shopify India (shopify.com/in/pricing, footnote "accurate as of 5 November 2026"):**
- Prices: Basic ₹1,994/mo, Grow ₹7,447, Advanced ₹30,164.
- Shopify Payments isn't available in India, so every Indian store pays Shopify's 2 / 1 / 0.6% third-party-gateway fee on top of Razorpay.
- Built in on every plan: Inbox chat, Flow automations, Shopify Email (10k emails/mo free), abandoned checkout, discounts, 200+ reports, Markets, basic POS, free fixed Bundles and Subscriptions.

**What a fashion brand in India still installs** (prices from the App Store, Oct–Nov 2026):

| Job (pain) | Typical app · price | Built into Frata? |
|---|---|---|
| COD confirmation, RTO control | GoKwik $35/mo + 3.5% of payment-aggregator transactions · Razorpay Magic 0.65–0.75% · Shopflo from ₹3,000 | Partly (COD rules, risk, confirm queue). WhatsApp: **no** |
| WhatsApp updates, campaigns | Interakt $55–69 · Wati $59–279 · Gallabox ₹2,999–16,999 · Shiprocket Engage ₹2.49/order | No |
| Shipping, tracking, NDR | Shiprocket ₹0–799/mo + freight · AfterShip $11–70 | No |
| Size and fit | Kiwi Sizing $7.99–26.99 | Size charts, model height: **yes** |
| Returns and exchanges | Return Prime $19.99–149.99 + $0.49 per extra request | No |
| Photo reviews | Judge.me free/$15 · Loox $49.99–299.99 | No |
| Profit per order | TrueProfit $35–200 + per-order fees | Engine yes (`profit.ts`); page no |
| GST invoices | $0–7 apps | **Yes** (1D·5) |
| Pre-order, made to order | $10–15 or 5% of revenue | **Yes** (availability) |
| Wishlist, back-in-stock | Swym $29.99–99.99 · STOQ $0–29 | No |
| Loyalty, referrals | Smile.io $15–199 | No |
| Instagram feed / shoppable | Instafeed $0–20 | No |
| Marketplace sync (Myntra, Ajio, Nykaa) | Unicommerce, EasyEcom: quote only, about 10 weeks to go live | No |

- A typical high-traffic Shopify store runs 11 apps for about $52/mo (Koala, Aug 2026).
- An Indian fashion brand's real stack (checkout, WhatsApp, returns, reviews, sizing, loyalty, profit) is plausibly **$150–400/mo plus percentages**. That figure is our estimate, not a source; test it against 3 real merchants (unit-economics rule 1).

## 2. The pain points, ranked, and the module that answers each

These come from the North star (frata-planning) and the research. Figures are directional.

| # | Pain | Evidence | Built-in module |
|---|---|---|---|
| 1 | **COD refused / RTO** | RTO ~21% across D2C (Feb 2026), ~39% at the Nov 2025 peak (PTI 2026-04-20). Fashion 25–40%. ₹180–500 per failed delivery. A ₹99 COD commitment fee cut RTO 40% in one ethnic-wear case (DFU 2026-04-09) | **RTO Shield**: WhatsApp COD confirm, pincode and phone history, address score, prepaid nudge, COD commitment fee, partial COD |
| 2 | **Size and fit returns** | Size/fit is >60% of stated returns (vendor, 2026). Value fashion returns 30–40% | **Fit & Returns**: exchange-first returns with reasons, reverse pickup, "runs small/large" learned from returns, fit feedback on the product page |
| 3 | **Catalogue work** | Size × colour grids, marketplace formats (no current figure) | Built (catalogue). Next: **bulk edit + marketplace export** |
| 4 | **Mobile checkout** | Tier 2/3 cities are ~66% of new D2C orders (FY26) | Built (one-page checkout). Next: UPI intent, saved address by phone |
| 5 | **Premium storefront** | | Built (themes). Next: lookbooks, shop-the-look |
| 6 | **True profit** | No tool nets COD remittance, RTO freight both ways, gateway fee and GST per order (research § 5) | **True Profit**: profit per delivered order, by product, pincode, campaign |
| 7 | **Festive peak** | Demand and RTO spike in Oct–Nov | **Run Frata** (load, queues) |
| — | Shipping ops | 4 vendors, 4 bills (research gap 2) | **Ship**: Shiprocket labels, tracking page, NDR queue |
| — | Repeat buyers | | **Retain**: WhatsApp abandoned bag, back-in-stock, photo reviews, then loyalty |
| — | Instagram DMs | No DM-to-COD-order tool (gap 6) | **Assisted orders**: a DM becomes a COD order with a payment or confirm link |
| — | Ad spend | Meta optimising for purchases, not deliveries | **Signals**: delivered-order events to Meta CAPI and Google (Phase 5) |

The research's main point: **the gaps are in the joins, not the jobs.** Risk, confirmation, courier,
NDR, return and profit are each sold by a different vendor today, with no shared customer or order record.
Frata already owns that record (one order, derived states, `orderProfit()`). Every module above is a reader
and writer of the same order, which no Shopify app can be.

## 3. Modules: the infrastructure

### What a module is
A **module** is a named capability (`rto_shield`, `whatsapp`, `ship`, `returns`, `reviews`, `true_profit`,
`back_in_stock`, `marketplace`, …) that:
1. is **declared once** in `src/domains/modules/registry.ts` (pure): key, name, one-line job, depends on
   (e.g. `rto_shield` → `whatsapp`), its settings schema (Zod), its default on/off, and its **billing kind**:
   `included` (in some plans), `add_on` (a monthly price), or `usage` (per message or per label, passed through);
2. is **granted** by the plan version (`plan_versions.features`, today) or by an **add-on subscription**
   (`tenant_addons`, new: tenant, module, price version, starts/ends);
3. is **switched on by the merchant** (`tenant_modules`, new: tenant, module, enabled_at, disabled_at).
   This is a fact the merchant chose, with history. Never a jsonb flag.

**Access is derived, never stored.** `canUse(tenant, module, now)` = granted (plan ∪ active add-on) ∧
switched on ∧ its dependencies can be used. It lives in one pure function in `src/domains/modules/access.ts`.
It is read by:
- **Server actions and queries** (the lock): an action for a module that isn't on refuses in words ("Turn on Returns in Apps").
- **The storefront**: a module's blocks render only when it's on; cached per shop, so the cache tag changes on toggle.
- **The outbox and cron**: a module's senders skip a shop that turned it off. A message queued before the switch is still sent, or dropped, as the module says.
- **The console nav and pages**: a module's pages appear only when it's on. The design rule already says "a row is added when its page exists".

### How code is organised (modular, so a module can be added or removed)
```
src/domains/<module>/      pure engine (e.g. returns/eligibility.ts, rto/score.ts)
src/lib/queries/<module>.ts  reads, withTenant
src/lib/connectors/<vendor>/ outbound calls (outbox senders), inbound webhooks
src/app/(console)/console/<module>/  its pages; registered in the nav by the registry
src/components/storefront/blocks/<module>.tsx  storefront blocks (reviews, fit note, back-in-stock)
drizzle/NNNN_<module>.sql   its tables, with tenant_id + RLS in the same migration
```
**Extension points** are named slots that modules fill, declared in the registry. The core never imports
a module; it asks the registry who fills a slot:
- order page: side cards (Delivery, Return, WhatsApp thread)
- product editor: cards (Reviews, Fit notes)
- storefront product page: blocks (Reviews, Fit, Back in stock)
- checkout: steps (COD commitment fee)
- Home: tiles

Removing a module is deleting its folder and its registry line; a gate (`check:modules`) fails if core code imports a module directly.

### The merchant's control: Console › Apps
- One page lists every module: what it does in one line, a Now/Next badge, what it costs ("In your plan",
  "₹999/mo", "Meta bills messages"), and a switch.
- Turning one on opens its setup: connect WhatsApp, pick a courier, set a return window.
- Turning one off says what stops ("Shoppers stop getting WhatsApp updates. Queued messages are cancelled.").
- Owners and admins only (CAN_MANAGE). Every change is audited.
- A module not in the plan shows "Add for ₹X/mo" or "In Growth", with the upgrade as the one action.
- Admin sees the same switches per merchant, and can grant a module for a trial.

### Billing: how packages and monthly fees work
The entitlement model above supports every option below without code changes, because price is data
(versioned rows), not code:

| Model | How it reads | Fits Frata? |
|---|---|---|
| **Tiers only** (today: Launch/Growth/Scale + delivered-order fee) | Modules come with the plan | Simple. But a Launch brand that only needs Returns must jump a tier |
| **Tiers + add-ons** (recommended) | Core modules in every plan; 2–4 premium modules as monthly add-ons; usage passed through | Matches how brands buy today (app by app), keeps the bill readable |
| **À la carte** | Base fee + every module priced | Most flexible, hardest to sell and support |
| **Usage** (messages, labels) | Pass-through at cost (+ a margin decision) | Already decided for WhatsApp (Meta bills the merchant); labels are a decision (unit-economics rule 9) |

**Recommended shape (hypothesis for `unit-economics-reviewer`):**
- **Every plan:** storefront, catalogue, checkout, orders, GST documents, COD rules, Partners.
- **Growth and up:** RTO Shield, Fit & Returns, Retain flows (the decided tier features).
- **Add-ons on any plan:** True Profit, Marketplace export, Reviews & UGC, Assisted DM orders.
- **Usage:** WhatsApp messages (Meta bills the merchant), courier freight (Shiprocket bills; margin to be decided).

Charging itself is Phase 6. Razorpay subscriptions take one monthly amount = plan + active add-ons,
derived from the same rows. So the add-on rows can exist, and be granted in Admin as trials, before any
money moves.

## 4. Scalability and reliability (what the module design must hold at 500 shops, festive 10×)

- **One access read per request:** the shop's modules come with `requireMember` (one row set, cached per
  request), like the plan. Never a query per check.
- **Outbound volume** (WhatsApp confirmations, tracking pulls) goes through the outbox with per-module
  rate limits and a per-shop fairness cap, so one shop's festive sale can't starve the others.
- **Storefront** stays cached: a module's storefront data is part of the shop's cache tag, and a toggle refreshes it.
- **Each module's tables are tenant-scoped with RLS**, proven in `tenancy.sql`. No module reads another
  module's tables; it goes through the order record or a domain function.
- **Kill switch:** Frata can turn a module off platform-wide (Admin) if a vendor breaks. The merchant
  reads "WhatsApp is paused by Frata · we're on it", never an error.

## 5. Milestone options (what to work on next)

| Option | Moves | Can start now? | Effort | Why / why not |
|---|---|---|---|---|
| **A. COD-to-delivery loop** (Phase 2: WhatsApp confirm, Shiprocket ship + tracking + NDR queue, RTO Shield as the first module) | #1, the biggest rupees | **Partly blocked**: Meta Tech Provider review and Shiprocket's partner answer (business track 2 and 3) | L | The pain every merchant names. Frata's main differentiator (one record from risk to RTO) |
| **B. Modules foundation** (registry, access, Console › Apps, Admin grants, `check:modules`) | Enabling (packages, add-ons) | Yes | S–M | Needed before selling any package. Best built WITH the first real module, not alone |
| **C. True Profit** (profit per delivered order by product, pincode and campaign; RTO cost) | #6, #1 | Yes (manual freight until Shiprocket) | M | Research gap #1, no competitor does it. Makes Frata's fee feel cheap |
| **D. Fit & Returns** (exchange-first returns, reasons, reverse pickup, fit learned from returns) | #2 | Mostly (reverse pickup needs Shiprocket) | L | Second-biggest money leak; strong in fashion |
| **E. Run Frata** (Phase 6 billing, GST invoices for Frata's fee, partner statements) | Revenue | Yes (Razorpay partner approval for subscriptions) | M | Needed to earn anything. Pointless before merchants are live |

**Recommendation: M2 = "COD-to-delivery loop", opened by B as its first task.**
1. **M2·0 Modules foundation:** registry, access, Console › Apps, Admin grants, with RTO Shield and
   WhatsApp as the first two real entries (built behind their switches).
2. **M2·1 WhatsApp:** connect (Tech Provider embedded signup), templates, COD confirmation on the order,
   delivery updates. Meta bills messages.
3. **M2·2 Ship:** Shiprocket connect, rate pick, label from the Pack action, tracking page for shoppers,
   the NDR ("Delivery failed") queue.
4. **M2·3 RTO Shield:** confirmation-gated COD, the ₹99-style commitment fee as a merchant rule,
   pincode/phone history, measured on confirmed vs unconfirmed COD (the roadmap's measure).

**If Meta or Shiprocket approvals aren't in hand when M2·0 is done, build C (True Profit) next.** It needs no
outside approval, uses the engine that exists, and proves the "profit per delivered order" promise to
the first merchants. That makes it the right parallel track.

## 6. Owner decisions needed

1. **Milestone:** M2 COD-to-delivery (recommended), or C True Profit first?
2. **Packaging:** tiers + add-ons (recommended), tiers only, or à la carte?
3. **Which modules are add-ons** (proposed: True Profit, Marketplace export, Reviews & UGC, Assisted DM
   orders), and their prices (to be modelled by `unit-economics-reviewer`).
4. **Freight:** pass-through at cost, or a margin (unit-economics rule 9)?
5. **Business track status:** has Meta business verification started? Has Shiprocket answered? These gate M2·1 and M2·2.

Next step once you pick: `frata-planning` loop. Research (integration-researcher on WhatsApp Tech
Provider and Shiprocket API, dated), spec per phase, mockup of Console › Apps and the first module, review agents, then build.

## Facts used (source · date)
Shopify India pricing and inclusions, shopify.com/in/pricing (2026-11-05) · App Store listings: Kiwi Sizing
(rev. 2026-10-19), Return Prime (2026-10-19), Judge.me (2026-11-05), Loox (2026-10-29), GoKwik (2026-10-30), AfterShip
(2026-10-31), Smile.io (2026-11-06), Swym (2026-09-29), Instafeed (2026-10-28), TrueProfit (2026-10-12) · Wati (©2026),
Gallabox (undated), Interakt (©2025, uncertain) · Shiprocket plans (©2026) · RTO and Tier 2/3 figures: Unicommerce/
Shipway via PTI (2026-04-20) · COD costs and the commitment-fee case: DFU Publications (2026-04-09) · App spend: Koala
(Aug 2026), Eightx/Storeleads (May 2026) · Dukaan pricing (offer to 2026-11-15) · BigCommerce gateway fees (sherocommerce, 2026, caps unverified).
