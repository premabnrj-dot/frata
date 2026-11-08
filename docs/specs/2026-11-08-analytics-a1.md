# A·0 + A·1 · Where orders come from, judged on deliveries
Status: built 2026-11-08 (plan `docs/plans/2026-11-08-analytics-a1.md`, A1·0–A1·7) · Date: 2026-11-08 · Mockup: https://claude.ai/artifact/5PRMG996toWDUsnAuMTSJt · Approved: owner, 2026-11-08: mockup as drawn, orders first (C); outcomes by hand and billable with the guards (A, E); ₹ kept by source in every plan (B); call D answered "Can we work on shipping module first?": **M2·2 Ship is planned and built before A·0/A·1**, so freight and outcomes come from Ship, with the shop's own estimate only for orders it ships itself
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
2. **The one question first:** ₹ kept **after returns** (profit on delivered orders minus what returns lost, both from
   `profit.ts`: `ifDelivered` and `ifRto`), with the change and what returns lost; then one line: orders → delivered ·
   came back (a share of the orders with an outcome) · on the way (sent, no outcome) · not sent yet. Then four numbers:
   orders, sales, came back (RTO) and "source known" (how many orders carry a source). Each with the change from the
   period before. A period that includes today says "so far" and that today's numbers still change.
3. **Where orders came from:** one row per source, most ₹ kept after returns first (by orders until any outcome is
   known): orders, sales, COD share, delivered, came back, ₹ kept after returns, and ₹ kept per order with an outcome (delivered, came back or lost: `kept.ts`; built so, A1·6). A rate
   is shown only when its own denominator is 30 or more (`judgeable(n)`, one rule in the domain); below that, counts
   ("3 of 24 came back"). On a phone, one card per source. Top sources plus "Other" (values a shopper can type).
4. **A source opens its page:** its campaigns (from the link's name) and its last 50 orders, each opening the order.
5. **Returns by pincode:** the pincodes with the most returns, as counts ("7 of 14 came back"); a rate only from 30.
   No rupees here: the ₹ cost of returns by pincode stays True Profit's (call B).
6. **Make a link** (the page's one primary action): where it will be shared (Instagram bio, a story, a WhatsApp
   broadcast, an Instagram or Facebook ad, a Google ad, a creator), which page (shop, a product, a collection), and a
   name ("Diwali drop"). Out comes the link with Copy, and the line "Orders from it show as Instagram bio · Diwali drop".
7. **How a source is decided,** in one line under the list: the tagged link the shopper arrived on, else the site they
   came from, else "Direct or unknown"; the last one before the order, in that browser tab.
8. **Before outcomes exist:** the delivered, came back and ₹ kept columns say "after delivery" and the strip links to
   the orders to mark (call A).
9. **Shipping costs (call D):** until Ship records real freight, ₹ kept uses two numbers the merchant gives once in
   Settings › Shipping: "a delivery costs you about ₹__" and "a return costs you about ₹__". Without them the page says
   "₹ kept before shipping costs" and links there. Offers' numbers use the same two.

### Who sees what
| | Owner · Admin | Partner (building the store) | Staff |
|---|---|---|---|
| Orders, sales, delivered, came back, sources, Make a link | yes | yes | yes |
| ₹ kept, ₹ per delivered order, shipping costs | yes | yes | no ("staff never see cost": design language); the same fix lands on Offers' ₹ kept, which shows it to staff today |
| Mark Shipped, Delivered, Came back; Undo | yes | no | Shipped only (packers) |

### The order page
- "Came from: Instagram bio · Diwali drop" under the customer, so a merchant can check a source against one order.
- (Call A) **Mark the outcome:** on a packed order, Shipped; on a shipped one, Delivered or Came back (RTO). Each with
  Undo, in the order's history. A new queue tab, **Awaiting delivery** (packed or shipped, no outcome; oldest first),
  with the same buttons on each row and bulk for up to 50.

### Outcomes by hand: the design (call A; architecture and tenancy reviews, 8 Nov)
- **One writer:** `src/lib/orders/outcomes.ts`, called by the console now and by M2·2 Ship later (actor `system`).
- **Guards in each UPDATE's WHERE** (tenant + id + state): Shipped needs `packed_at` set and `shipped_at`,
  `cancelled_at` null; Delivered and Came back need `shipped_at` set and both `delivered_at` and `rto_initiated_at`
  null (RTO outranks delivered in `orderState`, so a later RTO on a delivered order would flip it silently: refused).
- **Roles** in `src/domains/orders/work.ts` (`ROLES` and `WHEN`, one source for the button and the guard): Shipped for
  packers; Delivered and Came back for owners and admins; not partners.
- **History and Undo:** `order_events` gains `shipped`, `delivered` and `rto` (a migration widening the CHECK, then
  `verify:tenancy`). Undo names its event, compares and sets on the event's time, and is refused once anything later
  happened. Support visits audit as now.
- **Ship takes over:** once Ship (M2·2) has a shipment for an order, manual marks on it are refused; Ship never
  overwrites a manual mark silently (`actor_kind` tells them apart).
- **What else moves:** Best sellers (delivered units) refreshes the catalogue after a mark (`refreshShop(tenantId,
  'catalogue')`); the shopper's order view shows shipped, delivered or returning; a return does **not** restock by
  itself (an explicit per-line "Put back in stock", later, so Ship never restocks twice); the invoice is unchanged on
  a return (a credit note waits for returns and exchanges, phase 4, and a CA's answer).
- **Billing (call E):** Frrata's fee is per delivered order, so a hand mark joins the fee base.

## Design review
- **UI/UX:** one job (where my delivered orders come from), one primary action (Make a link). States: no orders yet
  (Make a link, with the shop's address); orders but none with a source (most orders "Direct or unknown": the link
  builder explained); outcomes not yet known (call A); a source under 30 orders ("too few to judge"); a period with no
  orders; error ("We could not load this screen"); phone (cards, the period as a segmented control, the strip two by
  two). Keyboard: the period control is a radio group; each source row is a link. Words from the merchant's world:
  "came from", "delivered", "came back (RTO)", "₹ kept".
- **Tenancy:** no new table (call D adds two columns to `shop_settings`; call A widens `order_events_kind`). Reads
  through `src/lib/queries/analytics.ts` in one `withTenant` (snapshot) with the tenant from `requireMember`. The
  source page takes only a classifier slug from the URL, re-reads the window and filters in TypeScript (never into SQL);
  its rows link to `/console/orders/[number]`, already tenant-scoped. The link builder formats the shop's own address
  from the server. **Referrer (tenancy review, HIGH):** a new key `ref_host` in both allow-lists (bag store and
  `/api/shop/orders`, whose regex drops unknown keys today); the **server** reduces it to a hostname
  (`new URL().hostname`, `^[a-z0-9.-]{1,253}$`, `android-app://` mapped to its package), drops the shop's own hosts
  and the payment pages; the browser records `document.referrer` only on the tab's first landing; storefront responses
  send `Referrer-Policy: strict-origin-when-cross-origin`. The attribution record is capped at 10 keys; a new tagged
  landing replaces the whole touch; the landing path is kept without its query. Shopper-typed values are rendered only
  as escaped text, never as a link. Logs carry the tenant id and `err.name` only.
- **Previews:** capture moves out of `BagButton` into its own island in `ShopShell` with an explicit `capture` prop,
  off in both the console preview and the Look preview (today the Look preview passes `live`, so capture runs there).
- **Modularity:** `src/domains/analytics/` (pure): `attributionOf(unknown)` (parses `checkout` null or `{}`),
  `classifySource()` (creator link > UTM > gclid as Google ads > fbclid as "Instagram or Facebook", never ads by
  itself, since Meta adds it to ordinary link taps too [S, 2026-09-29; Meta documents it for ads only, undated] > referrer >
  direct), with a `CLASSIFIER_VERSION` and a dated line on the page when the rule changes; channel names; the link
  builder's URL; `judgeable(n)`. `src/domains/orders/kept.ts` (pure, out of `offerStats`): sum, count, per order and
  how many had costs, for delivered (`ifDelivered`) and returned (`ifRto`) orders, over an IST-day window. Reads in
  `src/lib/queries/analytics.ts`; outcome writes in `src/lib/orders/outcomes.ts`.
- **SSOT / DRY:** state through `stateSql`; profit through `profit.ts` via `kept.ts`; COD through `currentMethodSql`;
  the source through one `classifySource()`; attribution stays one copy, raw, in `orders.checkout.attribution`
  (classified on read, so a better rule re-reads history; acceptable because nothing branches on it; it becomes a typed
  column when A·3's forwarding does). "Orders" and "sales" are defined once (standing or holding orders; sales = order
  totals) and Offers moves to IST-day windows, so one offer's ₹ kept is equal on both pages: a test holds it. The
  creator rule is one for both pages: an order using a creator code, counted through `useOfRowSql`, is that creator's
  whether the code was typed or linked. The fee is the plan in force when each order was placed, not today's.
- **YAGNI:** no visitors, no funnel, no beacon, no new database (A·2); no attribution models beyond last-touch-in-tab;
  no CSV (a merchant asks twice); no orders-list filter by source (the source page lists its orders).
- **KISS:** one page, one source page, one dialog, one pure classifier, one shared helper. No new table, no new
  dependency.
- **Scalability / performance:** one read covering the window and the period before (index `orders_tenant_placed`),
  selecting only `checkout->'attribution'`, the state columns and profit inputs, plus the order's creator code;
  classified and summed in TypeScript. 90 days is the cap, so up to 180 days are read: about 30k rows for a large shop
  at 10× festive. A plan step seeds that and runs EXPLAIN before the page is built; if a read passes 1 s, a typed
  `source_channel` written at placement replaces read-time classification. The Awaiting delivery tab gets its own
  predicate in `order-predicates.ts` (parity test) and a partial index (packed orders are outside `orders_open_idx`).
- **Reliability:** reads only; nothing outbound.
- **Security:** pages behind `requireMember`, figures by the roles table above; the outcome actions (call A) are
  `asMember(ROLES[x])`, guarded in their WHERE by state, recorded in the order's history; bulk reuses `pickIds` (at most
  50 ids, each through the single action).
- **Unit economics (reviewer, 8 Nov):** ₹0 to run. B in every plan is neutral for Frrata (True Profit's ₹999 has no
  attach data yet; Shopify already shows orders and sales by source on every plan; the TrueProfit app is $35+). A
  helps Frrata: the per-delivered fee is 60–76% of its revenue from a shop, and without outcomes its base is ₹0; but
  the merchant then controls the base (10% under-marking costs Frrata ₹216 / ₹1,572 / ₹3,413 a month at Launch /
  Growth / Scale): call E. Two caveats carried into the plan: `orders` has no COD-fee, packaging or ad-cost columns, so
  ₹ kept is "known costs only" and says so; and a source is judged on ₹ kept after returns, never per delivered order
  alone (₹279 if delivered vs ₹131 expected at 25% RTO for a Launch COD order). Cheapest test: three design partners for
  30 days, hand marks against their Shiprocket MIS or COD remittance; over a 5% gap, tighten call E's guards.
- **Blast radius:** attribution capture (moves to its own shell island; every shop page, every theme), the
  `/api/shop/orders` allow-list and a `Referrer-Policy` header, `offerStats` (moves to the shared helper and IST days;
  its ₹ kept hides from staff), the order page; with call A: `order_events_kind`, a new queue tab and predicate, Best
  sellers, the shopper's order view, `/api/shop/orders/view`, and later Ship's webhook (must not overwrite a manual
  mark). Packed orders already leave To pack today; nothing on Today changes. `erase.ts` also clears `fbclid`/`gclid`
  and `ref_host` from abandoned orders' `checkout` (they outlive 90 days today).

## Owner calls
- **A. Mark outcomes by hand until Ship** (recommended) · wait for M2·2 Ship. Most first merchants ship through their
  own Shiprocket panel or a local courier. Without outcomes, ₹ kept is empty everywhere, and so is Frrata's fee base.
- **B. ₹ kept by source in every plan** (recommended: Offers already shows ₹ kept to every plan, and two rules would
  confuse) · only in True Profit. True Profit keeps the deeper cuts: ₹ by product, size and colour, ad spend by
  campaign, and the ₹ cost of returns by pincode (A·1's pincode list shows counts only).
- **C. Build A·1 before A·2** (as recommended on 7 Nov) · the beacon first.
- **D. Ask each shop two shipping costs once** (recommended: "a delivery costs you about ₹70", "a return about ₹70"),
  so ₹ kept counts freight and returns until Ship records real costs · show "₹ kept before shipping costs". Today
  nothing records freight, so every ₹ kept, Offers' included, leaves it out.
- **E. A hand-marked delivery counts toward Frrata's per-delivered fee, as Ship's will** (recommended), with two
  guards: Undo closes when the month is billed, and an order shipped 30 days ago with no outcome counts as delivered
  unless marked came back · hand marks are never billed (every shop would then avoid Ship).

## Reviews (8 Nov, folded in above)
`architecture-reviewer` (changes needed: ₹ kept left out freight and returns; call A's writer; roles; capture in
previews; windows; judgeable denominators; performance), `tenancy-auditor` (safe; referrer reduced on the server;
roles and Undo for outcomes; capture keys capped), `unit-economics-reviewer` (B every plan, A billable with guards,
judge on ₹ kept after returns). Every finding is in the sections above or in calls D and E.

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
