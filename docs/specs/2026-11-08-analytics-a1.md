# A·0 + A·1 · Where orders come from, judged on deliveries
Status: draft · Date: 2026-11-08 · Mockup: https://claude.ai/artifact/5PRMG996toWDUsnAuMTSJt · Approved: —
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

## Research (UX refresh, 8 Nov; each source dated on the page, "NCSF" = no current source found)
- **Shopify Analytics:**
  - Taken: plain definitions of Direct and Unknown and of the one attribution rule (help.shopify.com marketing reports,
    content dated 2026-10-18); "reports that include today may change" (traffic reports, 2026-10-18); insights only for
    shops averaging 10+ orders a week, a sample floor (changelog 2026-04-20); annotations for data delays and definition
    changes (changelog 2026-05-05).
  - Avoid: five attribution models in a menu, whose default its own docs disagree on (2026-10-18); numbers that jump
    after a reclassification without saying so (channels 2026-10-18, sessions 2026-09-21).
- **Shiprocket seller dashboard:** Taken: every view compared with the previous period and filterable by payment
  mode; an RTO and NDR section with reasons (blog 2026-08-24); mobile NDR rows with one-tap actions (2026-05-01).
  Avoid: a "recovery rate" with no definition (2026-08-24). Razorpay's RTO page shows how much delivery data it has
  ("Delivery Data"): NCSF (undated), taken as an idea only.
- **Plausible:** Taken: channels, sources and campaigns as one card where a channel opens its sources; "Direct / None"
  explained as dark traffic from messengers and apps, where WhatsApp lands (docs updated 2026-11-05); a period still
  running compared with the same hours before (2026-09-09). Avoid: the comparison only on hover, which a phone cannot do.
- **Fathom:** Taken: the comparison value shown, not only its date (changelog 2026-03-04). Avoid: cross-tabs for power users.
- **Research:** text-only uncertainty works as a disclaimer, intervals are misread; show frequencies and a summary with
  drill-down (Frontiers in Digital Health, 2026-07-30). Build each screen around one question; every figure implies a
  next step (Smashing Magazine, 2026-08-26). NN/g and Baymard: NCSF for owner dashboards.
- **Link builders:** Shopify's shareable links: destination, then tags, Copy (blog 2026-10-17); lowercase values with
  one separator, because a typo splits a row. Avoid free-text source and medium.
- **Rules taken into the design:** one question first (₹ kept, then orders → delivered → came back → on the way); one
  primary action (Make a link); one fixed attribution rule said in one sentence; pending never shown as zero or as
  RTO; under 30 orders, counts ("1 of 13 came back") instead of rates; every rate names what it is a share of; how
  much of the data is known ("source known 94%"); sources as cards on a phone with the change inline, never on hover;
  presets write lowercase tags and the merchant names only the campaign.
- **Not taken now:** a QR code and a short link in Make a link (a QR library; a redirect service): if merchants ask.

## Design (mockup)
### Console › Analytics (new nav item, under Orders)
1. **Period:** 7, 30 or 90 days, against the period before it ("vs the 30 days before"). IST days.
2. **The one question first:** ₹ kept on delivered orders (with the change and ₹ per delivered order), then one line:
   orders → delivered · came back (a share of the orders with an outcome) · still on the way. Then four numbers:
   orders, sales, came back (RTO) and "source known" (how many orders carry a source). Each with the change from the
   period before. A period that includes today says "so far" and that today's numbers still change.
3. **Where orders came from:** one row per source, most ₹ kept first (by orders until any outcome is known): orders,
   sales, COD share, delivered, came back (rate of those with an outcome), ₹ kept and ₹ kept each. Under 30 orders a
   source shows counts ("1 of 13 came back · too few to judge"), never a rate. On a phone, one card per source.
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

## Facts used (rechecked 2026-11-08; recorded in `frata-integrations` 1.5.0 and `docs/setup.md`)
A·1 rests on none of them: it reads the main database and calls nothing outside. They bear on A·2 and A·3:
- Supabase Free: 2 active projects per user across organisations, 500 MB, pauses after a week idle; Pro from $25 with
  one Micro (Supabase docs, commits 2026-09-17 to 11-03). A·2's separate database needs Pro.
- Vercel Hobby: non-commercial; 100 deployments a day; one WAF rate-limit rule per project with 1M allowed requests;
  cron once a day and Cron Jobs now "legacy". Pro $20 a month; WAF rate limiting $0.55 per 1M in bom1 (vercel.com/docs,
  2026-06-16 to 09-16). A·2's 15-minute rollups need Pro or Supabase's pg_cron (Free availability unconfirmed).
- `Sec-Fetch-Site` on a beacon: specified, but unverified in WebKit and the Instagram in-app browser: A·2 never
  requires it (falls back to Origin).
- Google Ads: new offline conversion uploads go through the Data Manager API, which cannot retract; an RTO retraction
  needs the Google Ads API and a developer token (developer docs, read 2026-11-08; blog 2026-05-15). This adds a
  business-track item before A·3.
- DPDP: no change to Rule 8(3) or cookies found (2026-11-08).
