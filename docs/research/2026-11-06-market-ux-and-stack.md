# Market, UX and stack research — 2026-11-06

Status: research. **Every fact here is dated; recheck anything older than 90 days
before building on it.** Tags: **[V]** verified against a primary or several
independent sources · **[S]** vendor/affiliate sources only · **[U]** unverified or judgement.

## Verdicts

1. **The baseline is "Shopify + India apps", not bare Shopify** (high confidence).
   GoKwik / Razorpay Magic Checkout / Shopflo / Shiprocket Fastrr already sell COD
   risk and one-click checkout to Shopify merchants. A modelled RTO gain of
   21% → 16.5% is roughly what they claim; against that stack Frata's RTO edge is
   near zero. Rebuild the contribution model against Shopify Basic + GoKwik/Fastrr
   + Shiprocket + a WhatsApp tool.
2. **A cross-brand RTO network is not Frata's moat** (high confidence, 24 months).
   GoKwik claims 10–12k brands and 100–200M shoppers [S]. Shiprocket (listed
   NSE/BSE 19 Aug 2026) reports 83% accuracy flagging high-risk shipments in FY26
   and puts RTO-risk "Signals" on shopper profiles [S]. DPDP Rules: notice,
   consent and processor duties from 13 May 2027 [V].
3. **Shiprocket is supplier and most dangerous competitor**: shipping, checkout,
   RTO scoring, WhatsApp (Engage, rebuilt Sept 2026), Fastrr Ads, headless
   checkout for Next.js [S]. No platform partner programme found [U].
4. **The defensible position is the merchant's system of record for delivered
   profit** (medium confidence): reconciled from Razorpay settlements,
   Shiprocket COD remittance and freight, RTO loss and ad spend — data that sits
   in five tools in the Shopify stack. Plus fashion catalogue ops (size × colour,
   size charts) and a per-brand fit model from return reasons.

## Your findings, checked

| Claim | Status |
|---|---|
| Meta Tech Provider: 200 new customers / 7 days | [V] Default is **10**; 200 after business verification, app review and access verification; above 200 → Meta Business Partner |
| WhatsApp India: marketing ₹0.8631, utility ₹0.115 (+18% GST) | [S] consistent across BSP rate cards (Jul 2026). Meta's page not reached |
| Oct 2026: 1,000 free service messages then billed | [S] vendors disagree, also on utility inside the 24 h window. Check Meta before modelling |
| Instagram: no in-app checkout in India | [V/S] correct. New: Reels creator affiliate links in India (2026), 3–15% commissions |
| Content API for Shopping sunset 18 Aug 2026 | [V] Google; degradation from 1 Sep. Use Merchant API v1 |
| Razorpay onboarding via API and Route | [V] Partner Program → request **Aggregator** type → sub-merchant onboarding APIs. Route linked accounts after document review. Aggregators earn a share of the platform fee (rates unpublished — ask) |
| Shiprocket per-seller JWT, no partner programme | [U] a "channel integration" partner page exists; no terms found |
| Incorporate Pvt Ltd first | Recommended (high): Meta, Google OAuth, Ads token and Razorpay all bind to the legal name |

## Model challenges

- **5% ad saving from delivered-order signals: model 0–2%.** Meta CAPI rejects a
  whole request if any website event is older than 7 days [V]; COD delivery to
  smaller towns often takes about that long [U]. Use a custom "Delivered" event.
- **Shopify India pricing (shopify.com/in/pricing, 2026-11-06) [V]:** Basic ₹1,499
  yearly / ₹1,994 monthly; Grow ₹5,599 / ₹7,447; Advanced ₹22,680 / ₹30,164.
  Third-party gateway fee 2% / 1% / 0.6%; **COD exempt** [S]. A per-order Frata
  fee on COD can cost more than Shopify for the target merchant. Recommendation:
  flat ₹ per **delivered** order by tier.
- **UPI MDR** 0.4% on P2M UPI above ₹2,000 from 15 Oct 2026 [V].
- **Onboarding is the hidden fixed cost**: Meta verification, Instagram commerce
  review (up to 4 weeks), Merchant Center fixes; 10 WhatsApp onboardings a week
  until verified.
- **Scope for one builder**: v1 = storefront + checkout + Razorpay + Shiprocket
  + WhatsApp utility/COD confirmation + order console with profit and NDR + Meta
  CAPI. Defer Instagram DM inbox, Google Ads, email automations, cross-brand anything.

## Competitors

- **Shopify**: Polaris 2.0 RC and a new admin look; Built-for-Shopify apps must
  match by 1 May 2027 [V]. Merchants' expectations of a console come from here.
- **Checkout / RTO layer**: GoKwik (KwikCheckout, KwikPass, KwikEngage, Return
  Prime; ~$68M raised by 2025), Razorpay Magic Checkout (~0.65–0.75%/order),
  Shopflo (GMV-based), Shiprocket Fastrr.
- **Indian builders**: Dukaan (4.99%→0.99% service fee [S]; a pivot is
  unconfirmed), Shoopy, Zoho Commerce, Instamojo, StoreHippo. None fashion-first.

## UI/UX and brand

- Console layout follows Shopify's (Home, Orders, Products, Customers,
  Marketing, Analytics, Settings); differentiate on content, not layout.
- Orders default to a **work queue** (to confirm, NDR to act on). Each row:
  expected profit if delivered, COD-risk badge, NDR status.
- Phone first for orders, NDR, inbox, payouts.
- Console brand: neutral and numeric; the fashion lives in the storefront.
- Storefront: editorial, type-led, large imagery, sharp radius; Indian shopper
  conventions (pincode check, Pay on delivery, size chart + find my size,
  return window, WhatsApp updates); one-page OTP-first checkout [U].

## Stack

Vercel (bom1) + Supabase (ap-south-1); no AWS (ADR-0005). Multi-tenant
isolation: shared schema + RLS policies + explicit tenant filters, tenant id
set transaction-local (ADR-0002); practice consensus across Supabase/Makerkit/
ClickHouse guides [S].

## Sources

- [Shopify India pricing](https://www.shopify.com/in/pricing) · [Polaris 2.0 RC](https://shopify.dev/changelog/polaris-2-0-release-candidate)
- [Razorpay on Shopify gateway cost](https://razorpay.com/blog/shopify-payment-gateway-cost-india/) · [Razorpay Magic Checkout](https://razorpay.com/magic)
- [GoKwik funding, TechCrunch 2025](https://techcrunch.com/2025/06/24/indias-gokwik-raised-a-small-13m-round-for-a-hefty-leap-in-valuation) · [ClickPost RTO tools](https://www.clickpost.ai/blog/rto-reduction-tools)
- [Shiprocket Sept 2026 updates](https://www.shiprocket.in/blog/product-highlights-from-september-2026/) · [Shiprocket IPO note](https://ipowatch.in/wp-content/uploads/2026/08/ShipRocket-IPO-Note-SMC-Global-1786447717893.pdf)
- [Meta Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/) · [Infobip Tech Provider onboarding](https://www.infobip.com/docs/whatsapp/tech-provider-program/business-onboarding)
- [WhatsApp India rates (whautomate)](https://whautomate.com/whatsapp-business-api-pricing-india) · [Meta CAPI](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api)
- [Instagram Reels shopping India](https://indiantelevision.com/iworld/instagram-introduces-in-video-shopping-via-reels-in-india/)
- [Google Content API sunset](https://developers.google.com/shopping-content/guides/sunset)
- [Razorpay Aggregators](https://razorpay.com/docs/partners/aggregators/) · [Sub-merchant API](https://razorpay.com/docs/partners/aggregators/onboarding-api/workflow/)
- [DPDP Rules timeline](https://www.taxmann.com/post/blog/analysis-indias-dpdp-act-and-rules/) · [UPI MDR (Inc42)](https://inc42.com/features/upi-mdr-regime-explained-heres-what-will-be-charged-after-oct-15/)
- [Vercel multi-tenant limits](https://vercel.com/docs/multi-tenant/limits) · [Vercel multi-tenant concepts](https://vercel.com/docs/platforms/multi-tenant-platforms/concepts)
- [Multi-tenant RLS pattern (Makerkit)](https://makerkit.dev/blog/md/tutorials/multi-tenant-saas-architecture) · [Multi-tenant Postgres (ClickHouse)](https://clickhouse.com/resources/engineering/multi-tenant-saas-postgres-architecture)
- [Razorpay webhooks done right](https://dev.to/buildbyravirai/razorpay-webhooks-done-right-2026-signature-verification-idempotency-and-reconciliation-a9m)
