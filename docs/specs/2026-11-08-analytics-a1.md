# A·0 + A·1 · Where orders come from, judged on deliveries
Status: draft · Date: 2026-11-08 · Mockup: (below, once published) · Approved: —
Parent spec: `docs/specs/2026-11-07-analytics.md` (the module, its phases and owner calls 1–6). This spec re-checks
that one against what changed on 8 Nov and draws the first phase to build.

## What changed since the analytics proposal (7 Nov)
1. **Nothing writes delivered or RTO yet.** M2·2 Ship (Shiprocket) is not built, and no screen lets a merchant mark an
   order shipped, delivered or returned. `orders.shipped_at`, `delivered_at` and `rto_initiated_at` are never set in
   production. Every "delivered" and "₹ kept" number on the platform is empty today, including Offers' "Did it make
   money?" (O·3). The parent spec waited for Ship; this spec proposes a bridge (call A).
2. **Offers built their own results** (O·3, `offerStats` in `src/lib/queries/discounts.ts`): ₹ kept per delivered order,
   RTO against orders without an offer, new vs repeat buyers, prepaid share, "too few to judge" under 30, and creator
   codes with a `via` of `link` or `typed`. Analytics must reuse that maths, not compute it a second time, and treat a
   creator's link as a source.
3. **Creator links are a source.** `?code=` already fills a creator code and is recorded on `order_discounts` (`via`,
   `code_id`). The classifier reads it: "Creator · Riya" is a channel.
4. **The storefront is themed** (themes T1–T3): looks, sections, Hindi shop words, and two preview routes that render
   shop views inside the console (`/console/preview`, the Look preview). Attribution capture lives in the bag store, not
   in a theme, and must not run in a preview.
5. **Admin's access pattern is settled** (offers O·4): Admin reads tenant data only through `admin_*` policies with column
   grants, or a definer that returns aggregates. A·4 follows it; A·1 adds nothing to Admin.
6. **Modules exist** (M2·0): True Profit is a registered add-on (`status: next`), and `check:modules` keeps core code from
   importing module code. Where "₹ kept by source" lives is call B.
7. **Hosting:** the owner hit Vercel's preview-deployment limit (8 Nov; `claude/**` branches no longer deploy).
   Supabase and Vercel are still on their starting plans. A·1 needs neither to change; A·2's cost case is re-checked
   in `Facts used`.

## Goal
Ranked problems **(1) COD/RTO losses** and **(6) true profit per order**. A founder learns which source sends orders that
get delivered and which send orders that come back, in rupees kept, not visits.
Measure: (a) merchants who open Analytics in a week; (b) the share of orders with a known outcome (delivered or RTO)
30 days after placement; (c) after 60 days, whether shops that use the link builder have fewer orders from "Unknown".

## Job
After an Instagram post or a WhatsApp broadcast, a founder on a phone sees which source brought orders, how many were
delivered or came back, and what each left in rupees, and makes a tagged link for the next post.

## Research (UX refresh, 8 Nov)
See § Facts used for dates. Summary of what is taken:
- (filled from the UX research pass)

## Design (mockup)
### Console › Analytics (new nav item, under Orders)
1. **Period:** 7, 30 or 90 days, against the period before it ("vs the 30 days before"). IST days.
2. **The strip, four numbers:** orders, sales, delivered rate (with RTO rate beside it), ₹ kept per delivered order.
   Each shows the change from the period before. Under 30 orders: "too few to judge" instead of a change.
3. **Where orders came from:** one row per source, ranked by ₹ kept (by orders until any outcome is known): orders,
   sales, COD share, delivered, RTO, ₹ kept per delivered order. On a phone, one card per source.
4. **A source opens its page:** its campaigns (from the link's name) and its last 50 orders, each opening the order.
5. **Returns by pincode:** the pincodes with the most RTO among decided orders (at least 5 decided), with the rate.
6. **Make a link** (the page's one primary action): where it will be shared (Instagram bio, a story, a WhatsApp
   broadcast, an Instagram or Facebook ad, a Google ad, a creator), which page (shop, a product, a collection), and a
   name ("Diwali drop"). Out comes the link with Copy, and the line "Orders from it show as Instagram bio · Diwali drop".
7. **How a source is decided,** in one line under the list: the tagged link the shopper arrived on, else the site they
   came from, else "Direct or unknown"; the last one before the order, in that browser tab.
8. **Before outcomes exist:** the delivered, RTO and ₹ kept columns say "after delivery" and the strip links to the
   orders to mark (call A).

### The order page
- "Came from: Instagram bio · Diwali drop" under the customer, so a merchant can check a source against one order.
- (Call A) **Mark the outcome:** on a packed order, Shipped; on a shipped one, Delivered or Returned (RTO). Each with
  Undo, in the order's history. Bulk from the To pack tab later.

## Design review
- **UI/UX:** one job (where my delivered orders come from), one primary action (Make a link). States: no orders yet
  (Make a link, with the shop's address); orders but none with a source (most orders "Direct or unknown": the link
  builder explained); outcomes not yet known (call A); a source under 30 orders ("too few to judge"); a period with no
  orders; error ("We could not load this screen"); phone (cards, the period as a segmented control, the strip two by
  two). Keyboard: the period control is a radio group; each source row is a link. Words from the merchant's world:
  "came from", "delivered", "came back (RTO)", "₹ kept".
- **Tenancy:** no new table. Reads through `src/lib/queries/analytics.ts` in one `withTenant` (snapshot) with the tenant
  from `requireMember`. The link builder only formats the shop's own address. Attribution keys are allow-listed in
  `/api/shop/orders` as now; referrer is reduced to its host before it is sent.
- **Modularity:** `src/domains/analytics/` (pure): `classifySource()` (creator link > UTM > click id > referrer >
  direct), channel names, the link builder's URL. `src/domains/orders/kept.ts` (pure, moved out of `offerStats`): ₹ kept
  per delivered order and `JUDGE_MIN_ORDERS`, read by Offers and Analytics. Reads in `src/lib/queries/analytics.ts`.
- **SSOT / DRY:** state through `stateSql`; profit through `profit.ts` via `kept.ts`; COD through `currentMethodSql`;
  the source through one `classifySource()`; attribution stays one copy, raw, in `orders.checkout.attribution`
  (classified on read, so a better rule re-reads history). Offers' numbers and Analytics' numbers come from the same
  helpers and agree by construction; a test holds one offer's ₹ kept equal on both pages.
- **YAGNI:** no visitors, no funnel, no beacon, no new database (A·2); no attribution models beyond last-touch-in-tab;
  no CSV (a merchant asks twice); no orders-list filter by source (the source page lists its orders).
- **KISS:** one page, one source page, one dialog, one pure classifier, one shared helper. No new table, no new
  dependency.
- **Scalability / performance:** one read per window: orders placed in the window (index `orders_tenant_placed`), with
  attribution, state columns and profit inputs, plus the order's creator code; classified and summed in TypeScript.
  90 days is the cap. At 10× a festive week a large shop has ~15k orders in 90 days: one indexed range read, about
  2 MB, under 1 s. If it is not, a typed `source_channel` written at placement replaces read-time classification.
- **Reliability:** reads only; nothing outbound.
- **Security:** pages behind `requireMember`; the outcome actions (call A) are `asMember(CAN_MANAGE or packers)`,
  guarded in their WHERE by state, audited in the order's history.
- **Unit economics:** ₹0 to run. Call B decides who sees ₹ kept by source.
- **Blast radius:** `captureAttribution` (bag store, every shop page), `/api/shop/orders` allow-list, `offerStats`
  (moves to the shared helper), the order page; with call A, the order state machine's manual transitions and the
  Today tiles (a shipped order leaves To pack).

## Owner calls
- **A. Mark outcomes by hand until Ship** (recommended) · wait for M2·2 Ship. Most first merchants ship through their
  own Shiprocket panel or a local courier. Without outcomes, ₹ kept is empty everywhere.
- **B. ₹ kept by source in every plan** (recommended: Offers already shows ₹ kept to every plan, and two rules would
  confuse) · only in True Profit. True Profit keeps the deeper cuts (by product, size, pincode cost, ad spend).
- **C. Build A·1 before A·2** (as recommended on 7 Nov) · the beacon first.

## Out of scope
- Visitors, funnel, Web Vitals, consent and forwarding: A·2–A·4, unchanged from the parent spec.
- An orders-list filter by source: if merchants ask for it twice.
- Editing a source by hand: if a merchant shows a source is wrong.

## Facts used
- (from the platform facts pass, each with its source and date)
