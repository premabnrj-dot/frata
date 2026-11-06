---
name: frata-integrations
description: Use when building, planning or answering questions about a Frata connector - Razorpay (partner, sub-merchants, Route, webhooks), Shiprocket (API, rate shopping, NDR, COD remittance), Meta (Tech Provider, WhatsApp Cloud API, pricing, Conversions API, Instagram), Google (Merchant API, Ads, GA4, OAuth verification) or email - and for which facts about them are verified, when, and where from.
metadata:
  version: 1.0.0
  verified: 2026-11-06
  decisions: [ADR-0006]
---

# Frata integrations

**Facts here expire.** Each carries the date it was checked and a tag: [V]
primary source or several independent ones · [S] vendor/affiliate only · [U]
unverified. Older than 90 days or [S]/[U] and you are about to build on it →
run the `integration-researcher` agent first, then update this file and bump
the version. Full research: `docs/research/2026-11-06-market-ux-and-stack.md`.

## Rules for every connector

1. Outbound calls are `outbox` rows (ADR-0006), sent by a sender registered for
   the row's `kind`; every request through `fetchWithTimeout`.
2. Inbound webhooks: verify on the raw body, store under our key, answer 200,
   process later. Route listed in `scripts/check-actions.mjs` ENTRY_POINTS.
3. Per-merchant credentials live in a tenant table, encrypted; never in env,
   never logged, never sent to a browser.
4. A connector's state is shown to the merchant in words on the Channels hub:
   connected · needs attention (with the one action) · not connected.
5. Everything the platform must apply for (Meta app review, Google OAuth
   verification, Razorpay Aggregator) is in the **legal entity's** name — a Pvt
   Ltd before the first application (re-verifying later means downtime).

## Razorpay — checked 2026-11-06

- Partner Program → request the **Aggregator** partner type → sub-merchant
  onboarding APIs; sub-merchants must be activated before collecting [V].
- Aggregator partners have owner access to sub-merchant dashboards and earn a
  share of the platform fee when the partner key is used; rates unpublished [V/U].
- Route linked accounts (split settlements) only after Razorpay reviews the
  partner's documents [V].
- Webhooks: HMAC-SHA256 of the raw body in `X-Razorpay-Signature`; retries for
  24 h; ~5 s response window; persistently failing webhooks are disabled [S, Razorpay blog].
  Implemented: `src/lib/webhooks/razorpay.ts`.
- UPI MDR 0.4% on P2M UPI above ₹2,000 from 15 Oct 2026; small-merchant QR exemption [V].
- Magic Checkout ~0.65–0.75% per order (competitor reference) [S].

## Shiprocket — checked 2026-11-06

- Per-seller API credentials, token valid 24 h (founder's research) [U — confirm in docs].
- A "channel integration" partner entry point exists; **no platform partner
  terms found** [U]. Ask in writing before building on it.
- Competes with Frata: Fastrr Checkout (headless APIs incl. Next.js), Fastrr
  Signals (RTO risk on shopper profiles), Engage (WhatsApp), Fastrr Ads [S].
  Listed on NSE/BSE 19 Aug 2026 [S].

## Meta — checked 2026-11-06

- **Tech Provider**: business verification, app review (demo videos), access
  verification. Onboarding limit **10 new customers per rolling 7 days by
  default; 200 after the three verifications**; more → Meta Business Partner [V].
- Tech Provider customers add their own payment method; Meta bills them [V, founder].
- WhatsApp India rates (per message, +18% GST): marketing ₹0.8631; utility and
  authentication ₹0.115 [S, Jul 2026 card]. Service messages: from Oct 2026,
  first 1,000 per number per month free, then billed — **vendors disagree**,
  also on utility inside the 24 h window [S]. Check Meta's rate card.
- **Conversions API**: a website event's `event_time` may be up to 7 days old;
  ONE older event fails the WHOLE request [V, Meta docs]. Send "Delivered" as a
  custom event at delivery time; drop anything over 7 days before batching.
  Timestamps in seconds, not ms.
- Instagram India: no in-app checkout; product tags click through to the site;
  shop eligibility uneven; commerce review up to 4 weeks [V/S]. DMs → assisted
  order creation, not automatic. Reels creator affiliate links launched in
  India in 2026 (3–15% commission) [S].

## Google — checked 2026-11-06

- Content API for Shopping sunset 18 Aug 2026, degradation from 1 Sep → build
  only on **Merchant API v1** [V, Google].
- Sensitive OAuth scopes need brand verification; Google Ads needs a developer
  token with brand verification [U, founder].
- Never send Google user data to ad platforms (Google API policy) [U, founder].

## Privacy — checked 2026-11-06

DPDP Rules notified 13 Nov 2025; consent managers from 13 Nov 2026; notice,
consent, processor contracts and 72 h breach reporting from 13 May 2027 [V].
Frata is a processor for each merchant's shoppers; using one merchant's shopper
data for another needs a separate decision (CLAUDE.md § deliberately absent).
