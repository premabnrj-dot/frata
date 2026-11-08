# Research: analytics and tracking for Frrata (checked 2026-11-07)

Three research passes (sources with their own dates; "undated" = a live page with no date). Full reports were
returned in the planning session; this file keeps what the proposal rests on. Spec: `docs/specs/2026-11-07-analytics.md`.

## How Shopify does it
- **Counting:** sessions and visitors by cookie, a session ends after 30 min idle; a human/bot filter, and on
  21 Sep 2026 a bot reclassification shifted every session metric ("treat this as a new baseline") — orders did not
  move (changelog.shopify.com, 2026-09-21). Dashboard ~1 min behind; live view = active in the past 5 min.
- **Reports:** five attribution models, last non-direct click by default, 30-day referrer window; UTM, country,
  region, city; cohorts by first order; **no age or gender** (help.shopify.com, undated/2026). ShopifyQL for queries;
  "App Events" let apps add their own events to analytics (shopify.dev, 2026-10-28).
- **Collection:** Web Pixels (15 standard events: page_viewed … checkout_completed) in a sandbox: app pixels in a
  strict web worker, merchant custom pixels in an iframe; custom events can be forged by anyone; personal fields
  null without an approved scope since 10 Dec 2025 (shopify.dev, 2025-11-10); script tags retired (Order status
  26 Aug 2026, storefront 1 Mar 2027).
- **Consent:** the Customer Privacy API with four purposes (analytics, marketing, preferences, sale of data); new
  pixels need analytics + marketing consent by default in consent regions.
- **Third parties:** Google & YouTube app (Ads conversions; GA4 purchase server-side from Jul 2026 [S]); Meta's
  Conversions API sends the purchase server to server, deduplicated with the pixel on event_id + event_name within
  48 h; TikTok, Pinterest, Clarity through apps. **Nobody sends a "delivered" conversion.**
- **Limits:** Shopify vs GA4 never match (ad blockers, cookie refusal, bots, time zones); Safari deletes script-set
  cookies after 7 days (24 h after a decorated link).

## India's law (DPDP Act 2023, Rules G.S.R. 846(E) of 13 Nov 2025)
- Duties (notice, security, breach, retention, children, rights) apply from **13/14 May 2027**; consent managers
  from Nov 2026. Consent must be free, specific, informed, unambiguous, by clear action, and as easy to withdraw.
  Analytics and ads are not "legitimate uses": **consent is the safe basis** for per-person tracking and pixels.
- **Children (under 18):** no tracking, behavioural monitoring or targeted ads aimed at them.
- The **merchant is the data fiduciary**, Frrata the processor (needs a contract; must erase on the merchant's word).
- **Rule 8(3): personal data, traffic data and processing logs kept at least one year**, processors included.
  ⚠ Conflicts with `ERASE_AFTER_DAYS = 90` (src/lib/orders/erase.ts) and the M2 plan's payload purge — a lawyer
  question raised separately. CERT-In: ICT logs 180 days, rolling, in India.
- Meta's terms: a notice on every page with pixels; consent where law requires it; email/phone SHA-256, IP never hashed.
- No Indian guidance on cookie banners or IP hashing exists (no current source found).

## How others build it
- **Cookieless counting:** Plausible (hash of a daily salt + site + IP + UA; salt deleted daily; IP never stored;
  ClickHouse; 332B events stored), Fathom (same idea), Umami (Postgres-first, monthly salt).
- **At scale:** PostHog moved events off Postgres ("was frying") to ClickHouse (2026-05-01). At 50M events/month
  (~19/s, festive peak ~190/s) batched inserts into a partitioned Postgres hold comfortably (estimate).
- **Event model:** GA4 e-commerce (view_item_list … purchase, refund; items[]), Segment v2, Snowplow — Frrata adds
  server events: confirmed, delivered, rto, ndr.
- **Data possible:** UA (device, OS, browser; Android hides the model without client hints), Core Web Vitals
  (web-vitals v6), in-app browser (Instagram, FBAN/FBAV, WhatsApp), Vercel geo headers (country, region, city,
  postal code: a hint only), UTM/referrer/fbclid/gclid, language. **Age, gender, income: not possible** first-party.
- **Costs at 50M events/month:** build ≈ $250–400 (Vercel requests + a separate Supabase Large/XL); Vercel Web
  Analytics ≈ $1,500; PostHog ≈ $1,530; ClickHouse Cloud Mumbai from ≈ $310 when needed.
- **Pitfalls:** India's ad-block rate 25% (eyeo, May 2026) → serve the script and endpoint from the shop's own host;
  double counting (prefetch, bfcache, in-app → Safari hand-off); bots (isbot + data-centre ranges, before the IP is
  dropped). India benchmarks: festive COD return 58% vs prepaid <15% (Unicommerce, Apr 2026).
