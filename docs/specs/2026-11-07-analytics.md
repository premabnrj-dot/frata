# A · Shop analytics, built in
Status: draft · Date: 2026-11-07 · Mockup: https://claude.ai/artifact/L8qEogLftNmucUJewuYAaK · Approved: —

Research: `docs/research/2026-11-07-analytics.md` (Shopify, India's law, how others build it; every fact dated there).

## Goal
Ranked problems **(1) COD/RTO losses**, **(6) true profit per order**, **(4) mobile checkout conversion**. Shopify and
GA4 count sessions and purchases. Frrata can count **delivered orders and the profit they left, by source**, and tell
Meta and Google which clicks became deliveries and which came back as RTO. None of the products checked sends a
"delivered" conversion (research § Third parties).
Measure: (a) merchants who open Analytics weekly; (b) for shops that turn forwarding on, the RTO rate of ad-sourced
orders over 60 days against the 60 days before; (c) analytics cost per shop stays within the estimate below.

## Job
After an Instagram campaign, a founder on a phone sees in one screen:
- where visitors came from;
- how many of them ordered;
- how many of those orders were delivered;
- what profit each source left once returns are counted.

They get this without a developer, a GA4 account or a cookie banner they don't understand.

## Research (summary; full notes in the research file)
- **Shopify:**
  - What it does: cookie sessions (30 min), a bot filter, sources and UTM, cities, cohorts by first order, no age or
    gender. Collection runs through Web Pixels in a sandbox and consent through the Customer Privacy API (4 purposes).
    Purchases go to Meta and GA4 server-side.
  - Taken: GA4-shaped event names, the four consent purposes, pixels always in a sandbox, and the order as the truth
    for sales.
- **Plausible, Fathom, Umami:**
  - What they do: no cookie and no stored IP; unique visitors come from a hash with a daily salt.
  - Taken: counting before consent, with no banner needed.
- **PostHog:**
  - What it does: started on Postgres and moved to ClickHouse at scale.
  - Taken: Postgres now, with partitions and rollups, and ClickHouse when the volume says so.
- **India (DPDP Rules, 13 Nov 2025; duties from 13/14 May 2027):**
  - Consent is the safe basis for per-person tracking and ad pixels.
  - No tracking of under-18s.
  - The merchant is the fiduciary and Frrata the processor.
  - **Rule 8(3): traffic data and logs are kept at least one year** (owner call 4).
- **The codebase already has:**
  - `captureAttribution()` (`src/components/storefront/bag-store.ts`): utm_*, fbclid and gclid, kept per tab.
  - `orders.facts.attribution`, saved with each order.
  - Order states derived from timestamps, `profit.ts`, the outbox, Meta CAPI rules in `frata-integrations`.
  - The **True Profit** module (`src/domains/modules/registry.ts`: "Profit by product, pincode and campaign",
    status next, add-on).
  - Roadmap Phase 3 ("send delivered orders to Meta").
  - Missing: nothing writes `deliveredAt` or `rtoInitiatedAt` until **M2·2 Ship** lands.

## Design (see the proposal)

### Two streams, one report
1. **Order truth (main database, exists):** placed, confirmed, delivered, RTO, NDR and profit, derived by
   `order-state.ts` and `profit.ts`. Each order keeps its source in `facts.attribution`. Capture is extended to add
   referrer, landing page, first-touch time, `fbc` and `fbp`, and moves from per tab to the bag's lifetime.
2. **Browsing (beacon, new):** a client module in the storefront bundle, beside `captureAttribution`. It records
   page_view, view_item, add_to_cart and begin_checkout, plus Web Vitals from Next's `useReportWebVitals`, and batches
   them with `sendBeacon` to `/api/shop/e` on the shop's own host. A first-party request gets past ad blockers, which
   run on 1 in 4 Indian visitors.

**One classifier, both sides:** `classifySource()` in `src/domains/analytics/` turns UTM, referrer and click ids into a
channel. The orders report and the beacon both use it, so "Instagram bio" means the same thing in both.

**The join is by source, not by person:** the two databases cannot join in SQL. The page reads source-level totals
from each (two `withTenant` reads with the same tenant id), joins them in TypeScript by (day, channel), and says so.
They are not one snapshot. No event is ever joined to an order by an id taken from a beacon body.

```
shopper ──/api/shop/e (same host)──▶ Node route, bom1
                                     • tenant from host (requireShop → shopIdForHost), never the body
                                     • Sec-Fetch-Site same-origin; Vercel Firewall rate rule; drop bots
                                     • geo from Vercel headers → country, state, city
                                     • visitor = HMAC(daily salt, len-prefixed tenant|ip|ua); IP dropped here
                                     • insert inside withTenant (analytics pool), in after()
                                         ▼
                        analytics Postgres (separate Supabase project, Mumbai, Data API off)
                        events parent (RLS, grant) · partitions in an ungranted schema · (tenant_id, ts) index
                                         ▼ every 15 min, IST days, tenant_id first in every key
                        traffic_daily · funnel_daily (tenant × day × channel × device × top-N city × in-app)
                                         ▼
               Console › Analytics (withTenant ×2: orders + analytics)   Admin › Platform (definer fn, totals only)

orders ──outbox (drained in after())──▶ Meta CAPI · GA4 MP · Google Ads   (orders.marketing_consent_at only)
                                        destination looked up from row.tenantId at send · Purchase, Delivered
                                        RTO → GA4 refund + Ads adjustment
```

### Consent tiers (what each one unlocks)
| Tier | Needs | Unlocks |
|---|---|---|
| 0 · Counted | nothing: no cookie, no stored IP, salt deleted daily | visitors, pages, channels, devices, cities, funnel, Web Vitals, as totals |
| 1 · Analytics | the shopper says yes | a host-only `__Host-` visitor cookie, set by the server (13 months), keyed by (tenant, id): returning visitors, first touch, journeys |
| 2 · Marketing | the shopper says yes | forwarding to Meta, GA4 and Google Ads with click ids and hashed email/phone; recorded on the order as `marketing_consent_at` |

- **Under-18s:** when the merchant marks the shop as aimed at children, tiers 1 and 2 are off (DPDP).
- **Consent is read in the browser,** never rendered into the cached storefront HTML, so every shopper gets the same
  page.
- **The visitor cookie** is never used to find the tenant, and never crosses shops.

### What can be known
- **Acquisition:** channel, campaign (UTM), referrer, Instagram/WhatsApp/Google, fbclid/gclid, landing page.
- **Behaviour:** views, product views, add to cart, checkout steps, search terms, exits.
- **Technical:** device type, OS, browser, in-app browser (Instagram, Facebook, WhatsApp), Core Web Vitals (LCP, INP,
  CLS), language.
- **Location:** country, state and city from the IP, which is only a hint. The exact pincode comes from checkout.
- **Customer:** COD or prepaid, repeat buyer (from orders), new or returning (tier 1).
- **Outcomes (Frrata only):** delivered rate, RTO rate, NDR and ₹ kept, by channel, campaign, device, city and
  pincode.
- **Not possible first-party:** age, gender, income, the same shopper across shops.

### Who controls what
- **Admin (Frrata staff):**
  - the consent template and legal text (versioned) and their defaults;
  - bot rules (versioned and shown on the page);
  - retention windows;
  - event and history limits per plan (never blocking or billing on raw events, which can be forged);
  - platform totals and ingest health, through a definer function with no table grant;
  - the Meta/Google app credentials;
  - kill switches per shop and per destination;
  - never one shop's shoppers (ADR-0002).
- **Merchant (their own traffic only):**
  - the Analytics page and the link builder (bio, WhatsApp broadcast, ads);
  - the banner on or off, and its wording within the template, and which purposes it asks for;
  - connecting GA4, Meta and Google Ads, where the destination ids are stored per tenant;
  - excluding their own visits;
  - CSV export;
  - erasing a shopper.
- **Shopper:**
  - yes or no for each purpose;
  - withdrawing as easily as consenting (a footer link);
  - asking the shop to erase their data.

### Phases (each with its own mockup and sign-off)
- **A·0 Foundation:**
  - a regression net for the storefront and checkout flows;
  - `classifySource()`;
  - capture extended (referrer, landing page, first touch, fbc/fbp);
  - the merchant–Frrata processing terms (lawyer).
- **A·1 Sources by profit:** orders only, so no new database and no beacon, and about ₹0 to run.
  - Orders, value, COD share and cancellations by channel and campaign.
  - Delivered, RTO and ₹ kept by channel and pincode once M2·2 Ship writes those timestamps (**depends on M2·2**).
  - The link builder.
- **A·2 Traffic:** the beacon (tier 0), the analytics database with its tenancy design, visitors, channels, devices,
  cities, the funnel, and conversion by channel.
- **A·3 Consent and forwarding:** the banner, tiers 1 and 2, `marketing_consent_at`, and GA4 MP, Meta CAPI (Purchase +
  Delivered) and Google Ads with RTO retraction, through the outbox.
- **A·4 Admin:** platform totals, ingest health, kill switches.
- **Later:** a live count, a Web Vitals page, returning-visitor cohorts, ClickHouse.

## Owner calls (recommendation first)
1. **Build our own on Postgres** · buy. At 50M events a month (about 500 shops):
   - building costs about $250–400 a month (≈ ₹40–65 per shop);
   - PostHog costs about $1,530 and Vercel Web Analytics about $1,500;
   - only our own data joins to delivered orders and profit.

   Supabase is on the free plan today, so A·2 needs a paid org (about $25 a month plus compute). Run the
   `unit-economics-reviewer` on the A·2 plan.
2. **Tier 0 by default, no banner** · a banner on every shop from day one.
3. **A separate analytics database** · the same database as orders. Events must never slow orders at a festive peak.
4. **Raw events kept 90 days, rollups 2 years** · raw events for 1 year. Rule 8(3) may require 1 year for "traffic
   data". This is a lawyer question, and it also touches `ERASE_AFTER_DAYS = 90` in `src/lib/orders/erase.ts`.
5. **Orders-only report first (A·1), the beacon after** · the beacon first. A·1 moves problems 1 and 6 at no new cost
   and tests whether A·2 is worth paying for.
6. **Visitor counts in every plan; ₹ kept by source and forwarding in True Profit** (the registered add-on) · all
   analytics free. This is a pricing call, so run the `unit-economics-reviewer` before deciding.

## Design review (architecture-reviewer and tenancy-auditor on this spec, 2026-11-07, folded in)
- **UI/UX:**
  - One console page, Analytics: traffic, orders to deliveries, and channels ranked by ₹ kept.
  - Every number opens its orders.
  - States:
    - no orders yet (a link-builder prompt);
    - no traffic data yet (before A·2: "visits arrive with A·2");
    - a channel with under 30 orders: "too few to judge";
    - delivered not known yet (before Ship): "delivered arrives with shipping";
    - phone layout.
  - The storefront banner has two buttons of equal weight plus "choose".
  - Each phase draws its screens in its own mockup.
- **Tenancy:**
  - **Ingest:** the tenant comes from the host (`requireShop`, `shopIdForHost`, cached with the host in its key),
    never from the body. Each request inserts inside `withTenant`, never from a buffer shared across requests.
  - **The analytics database is a second lock to build, not assume:**
    - `src/lib/db/analytics.ts` with its own tenant transaction and pool;
    - its own migrations folder, read by `check:tenant`;
    - `verify:tenancy` extended to a second throwaway database;
    - that database's first migration creates `app_current_tenant()`, `frata_app` and `frata_admin`, and repeats
      0001's default-privilege revokes;
    - the Data API off.
  - **Partitions** live in a schema with no grants. Only the parent is granted and under RLS, and `verify:tenancy`
    proves that reading a partition directly fails.
  - **Rollups** run as `postgres`, so `tenant_id` comes first in every GROUP BY and unique key, with a proof that two
    tenants on the same day and channel never merge.
  - **Admin** gets totals through a definer function only, with no grant on `events`.
  - **Forwarding** looks up the destination (pixel, property, ad account) from `row.tenantId` under `withTenant` at
    send time, never from the payload or an event.
- **Modularity:**
  - `src/domains/analytics/` (pure): the event schema (Zod), `classifySource()`, the device and in-app parser, the
    hash input, the funnel maths.
  - Ingest at `src/app/api/shop/e/route.ts`: `/api` is untouched by `shopRewrites`, and `_e` would be a private
    folder.
  - Reads in `src/lib/queries/analytics.ts`.
  - Forwarding as outbox kinds listed in True Profit's `outboxKinds` (`check:modules`).
- **SSOT / DRY:**
  - Sales, delivered, RTO and profit are never copied into the analytics database.
  - A source is classified once, by one function, on both sides.
  - Attribution stays one copy, in `orders.facts.attribution`.
  - Marketing consent is a typed column on the order, not jsonb.
- **YAGNI:** left out are session replay, heatmaps, A/B tests, a query language, demographics, a live count (later:
  a raw read of the last 5 minutes, indexed), and cross-shop profiles. The signal to add one is a merchant asking
  twice.
- **KISS:**
  - A·1 is one classifier and one page over orders.
  - A·2 adds one module, one route, one table family and two rollups.
  - The only new dependency is `isbot`. Web Vitals come from Next.
- **Scalability:**
  - 50M events a month is about 19/s, and about 190/s at a festive peak. Batched inserts into daily partitions hold
    this.
  - Rollups are IST days, recomputed per day idempotently, with cities capped at the top N.
  - Old partitions are dropped, not deleted row by row.
  - ClickHouse comes in past about 1B raw rows, or when a rollup takes over 60 s.
- **Performance:**
  - The beacon ships in the storefront bundle, sends after load and never blocks the page.
  - The ingest answers 204 at once.
  - Rate limiting runs in the Vercel Firewall, never `rate_limits` in the main database (that would be 190 writes/s).
  - The middleware still runs on each beacon request, and that is counted in the cost.
  - Console reads come from rollups only (under 1 s).
- **Reliability:**
  - A lost event is acceptable, because events are only counts; orders never pass through the beacon.
  - Forwarding is idempotent: the event id is the order id plus the event name.
  - Meta's 7-day limit on event times is checked before sending.
  - The outbox is drained in `after()` as well as by the daily cron, because the cron alone could lag 24 h.
- **Security:**
  - `/api/shop/e` is public: Zod-validated, under 8 KB, known fields only, `Sec-Fetch-Site` checked, capped per
    tenant per minute.
  - Tier-0 numbers can be forged, so the page says so, and nothing bills or blocks on them.
  - Cost fields never reach the beacon (ADR-0003).
  - Ingest errors never log the IP or UA.
  - Merchant pixels, if ever allowed, run in a sandboxed iframe.
  - The salt lives in the analytics database, rotates per IST day and is cached per instance.
- **Unit economics:**
  - A·1 costs about ₹0.
  - A·2 costs about $25–40 a month at the start (a paid Supabase org plus small compute), and about ₹40–65 per shop a
    month at 500 shops.
  - Plan limits and call 6 decide who pays. Run `unit-economics-reviewer` on the A·2 plan and on call 6.
- **Blast radius:**
  - `shopRewrites` (if needed), the storefront client bundle, the order placement route (new attribution fields,
    `marketing_consent_at`), `erase.ts`, which must also reach the analytics database, and the outbox drain.
  - Footguns: bfcache and prefetch double counts; the in-app → Safari hand-off counted twice; the bot reclassification
    lesson (Shopify, 21 Sep 2026).
- **Erasure:** tier 0 holds nothing that links to a person. A tier-1 visitor id held on an order is erased with the
  order.

## Out of scope (and the signal that brings each back)
- Session replay and heatmaps: merchants ask twice, and DPDP consent is in place.
- GA4 client-side gtag on shops: a merchant needs a GA4 feature that MP can't feed.
- A cross-brand shopper graph: never without a decision superseding ADR-0002.
- ClickHouse: raw events pass about 1B rows, or a rollup takes over 60 s.

## Facts used
See `docs/research/2026-11-07-analytics.md`; each fact there carries its source and date. Before A·3 is planned:
- run `integration-researcher` on the GA4 Measurement Protocol refund and the Google Ads conversion adjustment, which
  have no dated facts in `frata-integrations` yet;
- recheck the Meta CAPI facts there if they are older than 90 days.
